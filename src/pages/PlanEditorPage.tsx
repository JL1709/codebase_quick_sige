import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignLeft, AlignRight, AlignVerticalDistributeCenter,
  ArrowRight, Bold, BringToFront, Check, CheckCircle2, ChevronDown, ChevronRight,
  Copy, FileOutput, Image, Lock, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Search, ShieldCheck,
  LayoutGrid, Maximize2, MessageSquare, Minus, Palette, RectangleHorizontal, Scan, SendToBack, Trash2, TriangleAlert, Type, Undo2, Unlock, ZoomIn, ZoomOut,
} from "lucide-react";
import Moveable, { type OnResize } from "react-moveable";
import Selecto from "react-selecto";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import { BlockVisual } from "../components/BlockVisual";
import { Badge, Button, EmptyState, Modal } from "../components/Ui";
import { blobObjectUrl, getBlob, saveBlob } from "../data/blobRepository";
import { renderPdfPage } from "../documents/pdfPreview";
import { hydrateBlockImages } from "../domain/blockImages";
import { calculateAnchoredScroll, calculateFitZoom, clampCanvasZoom, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, stepCanvasZoom } from "../domain/canvasViewport";
import { readableTextColor } from "../domain/colorContrast";
import { blockHierarchyColor, categoryDescendantIds, categoryHierarchyColor } from "../domain/categoryTree";
import { annotationBoundsFromDrag, createAnnotationElement, isMeaningfulAnnotationDrag, type AnnotationBounds, type AnnotationInsertTool, type AnnotationPoint } from "../domain/planAnnotations";
import {
  A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createBlockAreaElement,
  createSectionElement, CSS_PIXELS_PER_LAYOUT_UNIT, findNextFreeBlockPosition, findNextFreeNonBlockPosition,
  fitBlocksInArea, getBlockArea, minimumElementSize, reconcilePlanSectionsWithCatalog,
  resizeElementFromCssMeasurement, snapToGrid,
  type ElementResizeMeasurement,
} from "../domain/planLayout";
import { createPlanValidationIssues, type PlanValidationIssue } from "../domain/planValidation";
import type { BlockLayoutMode, BuildingBlockCategory, DocumentTemplate, Plan, PlanAnnotationStyle, PlanBlockElement, PlanConnectorPoint, PlanElement, PlanItem, PlanSection, PlanSectionElement, PlanShapeElement, PlanTextElement, Project } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { translate } from "../i18n/translations";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

const DOUBLE_CLICK_INTERVAL_MS = 500;
const DOUBLE_CLICK_DISTANCE_PX = 8;

interface PendingWordPlanGeneration {
  template: DocumentTemplate;
  templateBuffer: ArrayBuffer;
  missingPlaceholders: string[];
}

type InlineField = "brandText" | "titleText" | "projectNameText" | "projectDetailsText" | "statusText" | "coordinatorText" | "referenceText" | "sectionTitle" | "blockTitle" | "blockDescription" | "text";
interface InlineEditingState { elementId: string; field: InlineField }

interface SelectedBlock { sectionId: string; itemId: string; elementId: string }

interface ResizeSession {
  element: PlanElement;
  latestElement?: PlanElement;
}

interface AnnotationDraft {
  pointerId: number;
  start: AnnotationPoint;
  current: AnnotationPoint;
}

function resizeMeasurementFromMoveableEvent(
  element: PlanElement,
  event: Pick<OnResize, "direction" | "drag" | "height" | "width">,
): ElementResizeMeasurement {
  const [directionX, directionY] = event.direction;
  return {
    width: directionX === 0 ? element.width * CSS_PIXELS_PER_LAYOUT_UNIT : event.width,
    height: directionY === 0 ? element.height * CSS_PIXELS_PER_LAYOUT_UNIT : event.height,
    translateX: directionX < 0 ? event.drag.beforeTranslate[0] : 0,
    translateY: directionY < 0 ? event.drag.beforeTranslate[1] : 0,
    directionX,
    directionY,
  };
}

function applyResizePreview(target: HTMLElement | SVGElement, initialElement: PlanElement, resizedElement: PlanElement, measurement: ElementResizeMeasurement) {
  if (measurement.directionX !== 0) target.style.width = `${resizedElement.width * CSS_PIXELS_PER_LAYOUT_UNIT}px`;
  if (measurement.directionY !== 0) target.style.height = `${resizedElement.height * CSS_PIXELS_PER_LAYOUT_UNIT}px`;
  const translateX = (resizedElement.x - initialElement.x) * CSS_PIXELS_PER_LAYOUT_UNIT;
  const translateY = (resizedElement.y - initialElement.y) * CSS_PIXELS_PER_LAYOUT_UNIT;
  target.style.transform = `translate(${translateX}px, ${translateY}px)`;
}

function findItem(plan: Plan, selected: SelectedBlock | null): { section: PlanSection; item: PlanItem; element: PlanBlockElement } | null {
  if (!selected) return null;
  const section = plan.sections.find((candidate) => candidate.id === selected.sectionId);
  const item = section?.items.find((candidate) => candidate.id === selected.itemId);
  const element = plan.layout.elements.find((candidate): candidate is PlanBlockElement => candidate.kind === "block" && candidate.id === selected.elementId);
  return section && item && element ? { section, item, element } : null;
}

function isStyledAnnotationElement(element: PlanElement | undefined): element is PlanTextElement | PlanShapeElement {
  return element?.kind === "text" || element?.kind === "shape";
}

export function PlanEditorPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, getPlanForProject, updatePlan, publishPlan, addGeneratedDocument } = useApp();
  const { locale, t } = useI18n();
  const project = getProject(projectId);
  const storedPlan = getPlanForProject(projectId);
  const [plan, setPlan] = useState<Plan | null>(storedPlan ? structuredClone(storedPlan) : null);
  const [past, setPast] = useState<Plan[]>([]);
  const [future, setFuture] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishInput, setPublishInput] = useState(() => ({ index: String.fromCharCode(65 + database.revisions.filter((revision) => revision.projectId === projectId).length), changeSummary: "", approvedBy: "" }));
  const [publishedIndex, setPublishedIndex] = useState("");
  const [zoom, setZoom] = useState(0.7);
  const [fitMode, setFitMode] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [validationOpen, setValidationOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [activeInsertTool, setActiveInsertTool] = useState<AnnotationInsertTool | null>(null);
  const [blockFitMessage, setBlockFitMessage] = useState("");
  const [wordPlanGenerating, setWordPlanGenerating] = useState(false);
  const [wordPlanMessage, setWordPlanMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pendingWordPlan, setPendingWordPlan] = useState<PendingWordPlanGeneration | null>(null);
  const [editing, setEditing] = useState<InlineEditingState | null>(null);
  const [focusedIssueElementId, setFocusedIssueElementId] = useState<string | null>(null);
  const [moveableRevision, setMoveableRevision] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState(() => {
    const saved = window.localStorage.getItem("quicksige.plan-library.expanded");
    return new Set<string>(saved ? JSON.parse(saved) as string[] : database.categories.filter((category) => !category.parentId).map((category) => category.id));
  });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasShellRef = useRef<HTMLElement | null>(null);
  const moveableRef = useRef<{ updateRect: () => void } | null>(null);
  const validationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const validationOpenRef = useRef(validationOpen);
  const elementRefs = useRef(new Map<string, HTMLElement>());
  const transformSnapshot = useRef<Plan | null>(null);
  const resizeSession = useRef<ResizeSession | null>(null);
  const groupTransform = useRef(new Map<string, { dx: number; dy: number }>());
  const groupResizeElements = useRef(new Map<string, PlanElement>());
  const lastInlineClick = useRef<{ elementId: string; field: InlineField } | null>(null);
  const lastInlinePointer = useRef<{ elementId: string; field: InlineField; timestamp: number; clientX: number; clientY: number } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  validationOpenRef.current = validationOpen;

  const recalculateFit = useCallback(() => {
    const viewport = canvasShellRef.current;
    if (!viewport) return;
    setZoom(calculateFitZoom(
      viewport.clientWidth,
      viewport.clientHeight,
      A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT,
      A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT,
    ));
  }, []);
  const fitPlan = useCallback(() => {
    setFitMode(true);
    window.requestAnimationFrame(recalculateFit);
  }, [recalculateFit]);
  const setZoomAroundPoint = useCallback((nextZoom: number, pointerX?: number, pointerY?: number) => {
    const viewport = canvasShellRef.current;
    const clampedZoom = clampCanvasZoom(nextZoom);
    setFitMode(false);
    if (!viewport) { setZoom(clampedZoom); return; }
    const anchorX = pointerX ?? viewport.clientWidth / 2;
    const anchorY = pointerY ?? viewport.clientHeight / 2;
    const nextScroll = calculateAnchoredScroll(viewport.scrollLeft, viewport.scrollTop, anchorX, anchorY, zoom, clampedZoom);
    setZoom(clampedZoom);
    window.requestAnimationFrame(() => viewport.scrollTo({ left: nextScroll.left, top: nextScroll.top }));
  }, [zoom]);

  useEffect(() => {
    const viewport = canvasShellRef.current;
    if (!viewport) return undefined;
    const resizeObserver = new ResizeObserver(() => { if (fitMode) recalculateFit(); else moveableRef.current?.updateRect(); });
    resizeObserver.observe(viewport);
    if (fitMode) recalculateFit();
    return () => resizeObserver.disconnect();
  }, [fitMode, libraryOpen, recalculateFit]);

  useEffect(() => {
    const viewport = canvasShellRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = viewport.getBoundingClientRect();
      const direction = event.deltaY < 0 ? "in" : "out";
      const stepCount = Math.min(6, Math.max(1, Math.round(Math.abs(event.deltaY) / 100)));
      let nextZoom = zoom;
      for (let index = 0; index < stepCount; index += 1) nextZoom = stepCanvasZoom(nextZoom, direction);
      setZoomAroundPoint(nextZoom, event.clientX - bounds.left, event.clientY - bounds.top);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [setZoomAroundPoint, zoom]);

  useEffect(() => {
    if (!validationOpen && !insertOpen && !styleOpen) return undefined;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest("[data-toolbar-popover]")) {
        setValidationOpen(false);
        setInsertOpen(false);
        setStyleOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [insertOpen, styleOpen, validationOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => moveableRef.current?.updateRect());
    return () => window.cancelAnimationFrame(frame);
  }, [zoom, libraryOpen, plan, selectedElementIds]);

  const blockMap = useMemo(() => new Map(database.blocks.map((block) => [block.id, block])), [database.blocks]);
  const categoryMap = useMemo(() => new Map(database.categories.map((category) => [category.id, category])), [database.categories]);
  const blockArea = plan ? getBlockArea(plan.layout) : undefined;
  const selectedData = plan ? findItem(plan, selected) : null;
  const selectedBlock = selectedData ? blockMap.get(selectedData.item.blockId) : undefined;

  const applyPlan = (next: Plan) => {
    if (!plan) return;
    setPast((items) => [...items.slice(-49), structuredClone(plan)]);
    setFuture([]); setPlan(next); updatePlan(next);
  };
  const undo = () => {
    if (!plan || !past.length) return;
    const previous = past[past.length - 1]; setPast((items) => items.slice(0, -1)); setFuture((items) => [structuredClone(plan), ...items]); setPlan(previous); updatePlan(previous); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]);
  };
  const redo = () => {
    if (!plan || !future.length) return;
    const next = future[0]; setFuture((items) => items.slice(1)); setPast((items) => [...items, structuredClone(plan)]); setPlan(next); updatePlan(next); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]);
  };
  useEffect(() => { window.localStorage.setItem("quicksige.plan-library.expanded", JSON.stringify([...expandedCategories])); }, [expandedCategories]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (activeInsertTool) {
          event.preventDefault();
          setActiveInsertTool(null);
          return;
        }
        if (insertOpen || styleOpen) {
          event.preventDefault();
          setInsertOpen(false);
          setStyleOpen(false);
          return;
        }
        if (validationOpenRef.current) {
          event.preventDefault();
          setValidationOpen(false);
          window.requestAnimationFrame(() => validationTriggerRef.current?.focus());
          return;
        }
        if (publishOpen) return;
        if (selectedElementIds.length || editing) event.preventDefault();
        setEditing(null); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]);
        return;
      }
      if (command && (key === "z" || key === "y")) {
        event.preventDefault(); if (key === "y" || event.shiftKey) redo(); else undo(); return;
      }
      if (command && (key === "+" || key === "=" || key === "-")) {
        event.preventDefault(); setZoomAroundPoint(stepCanvasZoom(zoom, key === "-" ? "out" : "in")); return;
      }
      if (event.shiftKey && key === "1") { event.preventDefault(); fitPlan(); return; }
      if (!command && (key === "t" || key === "r")) {
        event.preventDefault();
        setActiveInsertTool(key === "t" ? "text" : "rectangle");
        setInsertOpen(false);
        setStyleOpen(false);
        return;
      }
      if (selectedElementIds.length && (event.key === "Delete" || event.key === "Backspace")) {
        if (!plan) return;
        event.preventDefault();
        const selectedIds = new Set(selectedElementIds);
        const removedItemIds = new Set(plan.layout.elements.flatMap((element) => selectedIds.has(element.id) && element.kind === "block" ? [element.itemId] : []));
        applyPlan({
          ...plan,
          sections: plan.sections.map((section) => ({ ...section, items: section.items.filter((item) => !removedItemIds.has(item.id)) })),
          layout: { ...plan.layout, elements: plan.layout.elements.filter((element) => !selectedIds.has(element.id) || element.kind === "title_block") },
        });
        setSelected(null); setSelectedElementId(null); setSelectedElementIds([]); return;
      }
      if (!plan || !selectedElementIds.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const amount = (event.shiftKey ? 10 : 1) * plan.layout.gridSize;
      const delta = { x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, y: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0 };
      applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => selectedElementIds.includes(element.id) && !element.locked ? clampElementToPage({ ...element, x: element.x + delta.x, y: element.y + delta.y }, plan.layout) : element) } });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!plan || (event.target as HTMLElement | null)?.matches("input, textarea, select, [contenteditable='true']")) return;
      const inlineTarget = document.elementsFromPoint(event.clientX, event.clientY)
        .map((candidate) => candidate.closest<HTMLElement>("[data-inline-field]"))
        .find((candidate): candidate is HTMLElement => Boolean(candidate));
      const elementId = inlineTarget?.closest<HTMLElement>(".canvas-element[data-element-id]")?.dataset.elementId;
      const field = inlineTarget?.dataset.inlineField as InlineField | undefined;
      const previous = lastInlinePointer.current;
      const closeToPrevious = previous
        ? Math.hypot(event.clientX - previous.clientX, event.clientY - previous.clientY) <= DOUBLE_CLICK_DISTANCE_PX
        : false;
      const resolvedElementId = elementId ?? (closeToPrevious ? previous?.elementId : undefined);
      const resolvedField = field ?? (closeToPrevious ? previous?.field : undefined);
      if (!resolvedElementId || !resolvedField) {
        lastInlinePointer.current = null;
        return;
      }
      const isDoubleClick = previous
        && previous.elementId === resolvedElementId
        && previous.field === resolvedField
        && event.timeStamp - previous.timestamp <= DOUBLE_CLICK_INTERVAL_MS
        && closeToPrevious;
      lastInlinePointer.current = { elementId: resolvedElementId, field: resolvedField, timestamp: event.timeStamp, clientX: event.clientX, clientY: event.clientY };
      if (!isDoubleClick) return;
      const element = plan.layout.elements.find((candidate) => candidate.id === resolvedElementId);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => {
        setSelectedElementId(element.id);
        setSelectedElementIds([element.id]);
        setSelected(element.kind === "block" ? { sectionId: element.sectionId, itemId: element.itemId, elementId: element.id } : null);
        setEditing({ elementId: element.id, field: resolvedField });
      }, 0);
      lastInlinePointer.current = null;
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  });

  if (!project) return <NotFoundPage />;
  if (!plan) return <div className="workspace-page"><EmptyState icon={<ShieldCheck />} title={t("project.noPlan")} text={t("project.noPlanText")} /></div>;

  const presentBlockIds = new Set(plan.sections.flatMap((section) => section.items.map((item) => item.blockId)));
  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  const activeBlocks = database.blocks.filter((block) => {
    const localized = block.translations[locale] ?? block.translations.de;
    const searchCorpus = [localized.title, localized.shortDescription, localized.longDescription, ...localized.searchTerms, ...block.regulations].join(" ").toLocaleLowerCase(locale);
    return block.lifecycle === "active" && searchCorpus.includes(normalizedSearch);
  });
  const validationIssues = createPlanValidationIssues({
    plan,
    project,
    blocks: database.blocks,
    documentConfigurations: database.documentConfigurations,
    documentTemplates: database.documentTemplates,
    locale,
    t,
  });
  const blockingValidationIssues = validationIssues.filter((issue) => issue.severity === "error");
  const warningValidationIssues = validationIssues.filter((issue) => issue.severity === "warning");

  const projectDocumentConfigurations = database.documentConfigurations.filter(
    (configuration) => configuration.projectId === project.id,
  );
  const selectedA4Template = () => {
    const configuredTemplateId = projectDocumentConfigurations.find(
      (configuration) => configuration.documentType === "a4_plan",
    )?.templateId;
    const availableTemplates = database.documentTemplates.filter(
      (template) => template.locale === locale
        && template.documentType === "a4_plan"
        && template.lifecycle !== "archived",
    );
    return availableTemplates.find((template) => template.id === configuredTemplateId)
      ?? availableTemplates.find((template) => template.origin === "standard")
      ?? availableTemplates.find((template) => template.origin === "custom");
  };
  const loadWordTemplate = async (template: DocumentTemplate): Promise<ArrayBuffer> => {
    if (template.origin === "standard") {
      const { blobToArrayBuffer, createStandardTemplate } = await import("../documents/templateEngine");
      return blobToArrayBuffer(await createStandardTemplate("a4_plan", template.locale));
    }
    if (!template.blobId) throw new Error(t("documents.templateFileMissing"));
    const templateBlob = await getBlob(template.blobId);
    if (!templateBlob) throw new Error(t("documents.templateFileMissing"));
    return templateBlob.arrayBuffer();
  };
  const finishWordPlanGeneration = async (template: DocumentTemplate, templateBuffer: ArrayBuffer) => {
    const { buildTemplateData, documentDependencyFingerprint, downloadBlob, renderTemplate } = await import("../documents/templateEngine");
    const blocksWithImages = await hydrateBlockImages(database.blocks);
    const generatedDocument = await renderTemplate(
      templateBuffer,
      buildTemplateData(project, plan, locale, blocksWithImages, database.categories, projectDocumentConfigurations),
    );
    const safeProjectNumber = project.projectNumber.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const filename = `${safeProjectNumber}-a4-plan-${new Date().toISOString().slice(0, 10)}.docx`;
    const generatedAt = new Date().toISOString();
    const blobId = newId("generated-blob");
    await saveBlob(blobId, generatedDocument);
    addGeneratedDocument({
      id: newId("generated-document"),
      projectId: project.id,
      documentType: "a4_plan",
      templateId: template.id,
      templateRevision: template.revision ?? 1,
      filename,
      blobId,
      projectSnapshot: structuredClone(project),
      planSnapshot: structuredClone(plan),
      language: locale,
      generatedAt,
      dependencyFingerprint: documentDependencyFingerprint(project, locale, plan),
      stale: false,
    });
    downloadBlob(generatedDocument, filename);
    setWordPlanMessage({ tone: "success", text: t("documents.generated", { name: filename }) });
  };
  const createWordPlan = async () => {
    const template = selectedA4Template();
    if (!template) {
      setWordPlanMessage({ tone: "danger", text: t("documents.noTemplate") });
      return;
    }
    setWordPlanGenerating(true);
    setWordPlanMessage(null);
    try {
      const { buildTemplateData, inspectTemplate } = await import("../documents/templateEngine");
      const templateBuffer = await loadWordTemplate(template);
      const templateData = buildTemplateData(project, plan, locale, database.blocks, database.categories, projectDocumentConfigurations);
      const inspection = await inspectTemplate(templateBuffer, templateData);
      if (inspection.unsafeCommands.length) {
        setWordPlanMessage({
          tone: "danger",
          text: t("documents.unsafeTemplate", { commands: inspection.unsafeCommands.join(", ") }),
        });
        return;
      }
      if (inspection.missingPlaceholders.length) {
        setPendingWordPlan({ template, templateBuffer, missingPlaceholders: inspection.missingPlaceholders });
        return;
      }
      await finishWordPlanGeneration(template, templateBuffer);
    } catch (error) {
      setWordPlanMessage({
        tone: "danger",
        text: error instanceof Error ? error.message : t("documents.generationFailed"),
      });
    } finally {
      setWordPlanGenerating(false);
    }
  };
  const proceedWithMissingWordPlaceholders = async () => {
    if (!pendingWordPlan) return;
    setWordPlanGenerating(true);
    setWordPlanMessage(null);
    try {
      await finishWordPlanGeneration(pendingWordPlan.template, pendingWordPlan.templateBuffer);
      setPendingWordPlan(null);
    } catch {
      setWordPlanMessage({ tone: "danger", text: t("documents.generationFailed") });
    } finally {
      setWordPlanGenerating(false);
    }
  };

  const addBlock = (blockId: string) => {
    const block = blockMap.get(blockId); if (!block) return;
    const item: PlanItem = { id: newId("item"), blockId };
    let targetSection = plan.sections.find((section) => section.categoryId === block.primaryCategoryId);
    const sections = targetSection ? plan.sections.map((section) => section.id === targetSection?.id ? { ...section, items: [...section.items, item] } : section) : [...plan.sections, { id: newId("section"), categoryId: block.primaryCategoryId, items: [item] }];
    const reconciledSections = reconcilePlanSectionsWithCatalog(sections, database.categories, database.blocks);
    targetSection = reconciledSections.find((section) => section.items.some((candidate) => candidate.id === item.id));
    if (!targetSection) return;
    const free = findNextFreeBlockPosition(plan.layout);
    const element: PlanBlockElement = clampElementToPage({ id: newId("layout-block"), kind: "block", sectionId: targetSection.id, itemId: item.id, blockId, x: free.x, y: free.y, width: free.width, height: free.height, zIndex: 500 + plan.layout.elements.length, semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1 }, plan.layout) as PlanBlockElement;
    const hasSectionElement = plan.layout.elements.some((candidate) => candidate.kind === "section" && candidate.sectionId === targetSection?.id);
    const sectionElement = hasSectionElement ? undefined : createSectionElement(targetSection.id, plan.layout, element.y);
    const draftLayout = { ...plan.layout, elements: [...plan.layout.elements, ...(sectionElement ? [sectionElement] : []), element] };
    const fitted = fitBlocksInArea(draftLayout, reconciledSections, database.categories, database.blocks);
    setBlockFitMessage(fitted.fits ? "" : t("editor.fitBlocksTooSmall"));
    applyPlan({ ...plan, sections: reconciledSections, layout: fitted.layout });
    setSelected({ sectionId: targetSection.id, itemId: item.id, elementId: element.id });
    setSelectedElementId(element.id);
    setSelectedElementIds([element.id]);
  };
  const addAsset = (assetId: string, requestedPosition?: { x: number; y: number }) => {
    const asset = project.assets.find((candidate) => candidate.id === assetId); if (!asset) return;
    const free = findNextFreeNonBlockPosition(plan.layout, 2_500, 1_600);
    const element = clampElementToPage({ id: newId("layout-asset"), kind: asset.mimeType === "application/pdf" ? "pdf_page" : "image", assetId, pageNumber: asset.mimeType === "application/pdf" ? 1 : undefined, x: requestedPosition?.x ?? free.x, y: requestedPosition?.y ?? free.y, width: free.width, height: free.height, zIndex: 700 + plan.layout.elements.length, semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1 }, plan.layout);
    applyPlan({ ...plan, includedAssetIds: [...new Set([...plan.includedAssetIds, assetId])], layout: { ...plan.layout, elements: [...plan.layout.elements, element] } });
    setSelectedElementId(element.id); setSelectedElementIds([element.id]); setSelected(null);
  };
  const addAnnotation = (tool: AnnotationInsertTool, bounds?: AnnotationBounds) => {
    const element = createAnnotationElement(tool, newId(`layout-${tool}`), plan.layout, bounds);
    applyPlan({ ...plan, layout: { ...plan.layout, elements: [...plan.layout.elements, element] } });
    setSelectedElementId(element.id); setSelectedElementIds([element.id]); setSelected(null);
    setActiveInsertTool(null);
    window.requestAnimationFrame(() => setMoveableRevision((revision) => revision + 1));
    if (element.kind === "text" || (element.kind === "shape" && element.shape === "callout")) {
      setEditing({ elementId: element.id, field: "text" });
    }
  };
  const addLibraryItem = (id: string, position?: { x: number; y: number }) => {
    const [kind, value] = id.split(":", 2);
    if (kind === "block") addBlock(value);
    else if (kind === "asset") addAsset(value, position);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over?.id !== "plan-canvas" || !event.active.rect.current.translated || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const translated = event.active.rect.current.translated;
    const x = (translated.left + translated.width / 2 - canvasRect.left) * plan.layout.width / canvasRect.width;
    const y = (translated.top + translated.height / 2 - canvasRect.top) * plan.layout.height / canvasRect.height;
    addLibraryItem(String(event.active.id), { x: snapToGrid(x - 1_150), y: snapToGrid(y - 360) });
  };
  const updateElement = (elementId: string, patch: Partial<PlanElement>) => {
    applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => element.id === elementId ? { ...element, ...patch } as PlanElement : element) } });
  };
  const selectOrCreateBlockArea = () => {
    const existingArea = getBlockArea(plan.layout);
    if (existingArea) {
      setSelected(null); setSelectedElementId(existingArea.id); setSelectedElementIds([existingArea.id]);
      return;
    }
    const newArea = createBlockAreaElement();
    applyPlan({ ...plan, layout: { ...plan.layout, elements: [newArea, ...plan.layout.elements] } });
    setSelected(null); setSelectedElementId(newArea.id); setSelectedElementIds([newArea.id]); setBlockFitMessage("");
  };
  const updateBlockLayoutMode = (layoutMode: BlockLayoutMode) => {
    if (!blockArea) return;
    updateElement(blockArea.id, { layoutMode } as Partial<PlanElement>);
    setBlockFitMessage("");
  };
  const fitBlocks = () => {
    if (!blockArea) return;
    const reconciledSections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, database.blocks);
    const fitted = fitBlocksInArea(plan.layout, reconciledSections, database.categories, database.blocks, blockArea.layoutMode);
    setBlockFitMessage(fitted.fits ? "" : t("editor.fitBlocksTooSmall"));
    if (!fitted.fits) return;
    applyPlan({ ...plan, sections: reconciledSections, layout: fitted.layout });
    const refittedSelection = selectedElementId
      ? fitted.layout.elements.find((element) => element.id === selectedElementId)
      : undefined;
    setSelected(refittedSelection?.kind === "block"
      ? { sectionId: refittedSelection.sectionId, itemId: refittedSelection.itemId, elementId: refittedSelection.id }
      : null);
  };
  const updateSection = (sectionId: string, patch: Partial<PlanSection>) => {
    applyPlan({ ...plan, sections: plan.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) });
  };
  const commitInlineEdit = (elementId: string, field: InlineField, value: string) => {
    const element = plan.layout.elements.find((candidate) => candidate.id === elementId);
    if (!element) return;
    if (element.kind === "block" && (field === "blockTitle" || field === "blockDescription")) {
      applyPlan({
        ...plan,
        sections: plan.sections.map((section) => section.id === element.sectionId ? {
          ...section,
          items: section.items.map((item) => item.id === element.itemId ? field === "blockTitle"
            ? { ...item, customTitle: { ...item.customTitle, [locale]: value } }
            : { ...item, customShortDescription: { ...item.customShortDescription, [locale]: value } }
            : item),
        } : section),
      });
    } else if (element.kind === "section" && field === "sectionTitle") {
      updateSection(element.sectionId, { titleOverrides: { ...plan.sections.find((section) => section.id === element.sectionId)?.titleOverrides, [locale]: value } });
    } else if ((element.kind === "text" || (element.kind === "shape" && element.shape === "callout")) && field === "text") {
      updateElement(element.id, { text: { ...element.text, [locale]: value } });
    } else if (element.kind === "header" && ["brandText", "titleText", "projectNameText", "projectDetailsText", "statusText"].includes(field)) {
      const existing = element[field as keyof typeof element] as Partial<Record<"de" | "en", string>> | undefined;
      updateElement(element.id, { [field]: { ...existing, [locale]: value } } as Partial<PlanElement>);
    } else if (element.kind === "title_block" && ["projectNameText", "coordinatorText", "referenceText"].includes(field)) {
      const existing = element[field as keyof typeof element] as Partial<Record<"de" | "en", string>> | undefined;
      updateElement(element.id, { [field]: { ...existing, [locale]: value } } as Partial<PlanElement>);
    }
    setEditing(null);
  };
  const navigateToIssue = (issue: PlanValidationIssue) => {
    if (!issue.elementId || !plan.layout.elements.some((element) => element.id === issue.elementId)) return;
    const element = plan.layout.elements.find((candidate) => candidate.id === issue.elementId);
    setSelectedElementId(issue.elementId);
    setSelectedElementIds([issue.elementId]);
    setSelected(element?.kind === "block" ? { sectionId: element.sectionId, itemId: element.itemId, elementId: element.id } : null);
    setValidationOpen(false);
    setFocusedIssueElementId(issue.elementId);
    if (zoom < 0.8) setZoomAroundPoint(0.8);
    window.requestAnimationFrame(() => {
      const target = elementRefs.current.get(issue.elementId as string);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      target?.focus({ preventScroll: true });
      window.setTimeout(() => setFocusedIssueElementId(null), 1_500);
    });
  };
  const removeSelectedElements = () => {
    const ids = new Set(selectedElementIds);
    if (!ids.size) return;
    const removedItemIds = new Set(plan.layout.elements.flatMap((element) => ids.has(element.id) && element.kind === "block" ? [element.itemId] : []));
    applyPlan({
      ...plan,
      sections: plan.sections.map((section) => ({ ...section, items: section.items.filter((item) => !removedItemIds.has(item.id)) })),
      layout: { ...plan.layout, elements: plan.layout.elements.filter((element) => !ids.has(element.id) || element.kind === "title_block") },
    });
    setSelected(null); setSelectedElementId(null); setSelectedElementIds([]);
  };
  const finishTransform = (element: PlanElement) => {
    if (transformSnapshot.current) setPast((items) => [...items.slice(-49), transformSnapshot.current as Plan]);
    let sections = plan.sections;
    let resolvedElement = element;
    if (element.kind === "block") {
      const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
      const targetSectionElement = plan.layout.elements
        .filter((candidate): candidate is PlanSectionElement => candidate.kind === "section"
          && center.x >= candidate.x && center.x <= candidate.x + candidate.width
          && center.y >= candidate.y && center.y <= candidate.y + candidate.height)
        .sort((left, right) => left.width * left.height - right.width * right.height)[0];
      if (targetSectionElement?.kind === "section" && targetSectionElement.sectionId !== element.sectionId) {
        const item = plan.sections.find((section) => section.id === element.sectionId)?.items.find((candidate) => candidate.id === element.itemId);
        if (item) {
          sections = plan.sections.map((section) => section.id === element.sectionId
            ? { ...section, items: section.items.filter((candidate) => candidate.id !== item.id) }
            : section.id === targetSectionElement.sectionId ? { ...section, items: [...section.items, item] } : section);
          resolvedElement = { ...element, sectionId: targetSectionElement.sectionId };
        }
      }
    }
    const next = { ...plan, sections, layout: { ...plan.layout, elements: plan.layout.elements.map((candidate) => candidate.id === resolvedElement.id ? resolvedElement : candidate) } };
    setFuture([]); setPlan(next); updatePlan(next); transformSnapshot.current = null;
  };
  const readElementBounds = (target: Element) => {
    const pageElement = target.closest<HTMLElement>(".wysiwyg-page");
    const pageBounds = pageElement?.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    if (!pageBounds || !pageElement) return null;
    const renderedScale = pageBounds.width / pageElement.offsetWidth;
    const scale = CSS_PIXELS_PER_LAYOUT_UNIT * renderedScale;
    return {
      x: (targetBounds.left - pageBounds.left) / scale,
      y: (targetBounds.top - pageBounds.top) / scale,
      width: targetBounds.width / scale,
      height: targetBounds.height / scale,
    };
  };
  const selectedElement = selectedElementId ? plan.layout.elements.find((element) => element.id === selectedElementId) : undefined;
  const selectedAnnotation = selectedElementIds.length === 1 && isStyledAnnotationElement(selectedElement) ? selectedElement : undefined;
  const selectedTarget = selectedElement ? elementRefs.current.get(selectedElement.id) ?? null : null;
  const selectedTargets = selectedElementIds.map((id) => elementRefs.current.get(id)).filter((target): target is HTMLElement => Boolean(target));
  const unlockedSelectedTargets = selectedTargets.filter((target) => {
    const element = plan.layout.elements.find((candidate) => candidate.id === target.dataset.elementId);
    return element && !element.locked;
  });
  const updateSelectedElements = (updater: (element: PlanElement, index: number) => PlanElement) => {
    const ids = new Set(selectedElementIds);
    let index = 0;
    applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => {
      if (!ids.has(element.id)) return element;
      const updated = updater(element, index); index += 1; return updated;
    }) } });
  };
  const updateSelectedAnnotationStyle = (patch: Partial<PlanAnnotationStyle>) => {
    updateSelectedElements((element) => isStyledAnnotationElement(element) ? { ...element, ...patch } : element);
  };
  const moveSelectedAnnotationToLayerEdge = (direction: "front" | "back") => {
    if (!selectedAnnotation) return;
    const otherElements = plan.layout.elements.filter((element) => element.id !== selectedAnnotation.id && element.kind !== "block_area");
    const nextZIndex = direction === "front"
      ? Math.max(1, ...otherElements.map((element) => element.zIndex)) + 1
      : Math.max(1, Math.min(700, ...otherElements.map((element) => element.zIndex)) - 1);
    updateElement(selectedAnnotation.id, { zIndex: nextZIndex });
  };
  const duplicateSelectedElements = () => {
    const selectedElements = plan.layout.elements.filter((element) => selectedElementIds.includes(element.id));
    if (!selectedElements.length) return;
    let sections = plan.sections;
    const duplicates: PlanElement[] = [];
    selectedElements.forEach((element) => {
      if (element.kind === "block") {
        const item = sections.find((section) => section.id === element.sectionId)?.items.find((candidate) => candidate.id === element.itemId);
        if (!item) return;
        const duplicateItem = { ...structuredClone(item), id: newId("item") };
        sections = sections.map((section) => section.id === element.sectionId ? { ...section, items: [...section.items, duplicateItem] } : section);
        duplicates.push(clampElementToPage({ ...element, id: newId("layout-block"), itemId: duplicateItem.id, x: element.x + plan.layout.gridSize * 4, y: element.y + plan.layout.gridSize * 4, zIndex: element.zIndex + 1 }, plan.layout));
      } else if (element.kind !== "title_block" && element.kind !== "header" && element.kind !== "block_area") {
        duplicates.push(clampElementToPage({ ...structuredClone(element), id: newId(`layout-${element.kind}`), x: element.x + plan.layout.gridSize * 4, y: element.y + plan.layout.gridSize * 4, zIndex: element.zIndex + 1 }, plan.layout));
      }
    });
    applyPlan({ ...plan, sections, layout: { ...plan.layout, elements: [...plan.layout.elements, ...duplicates] } });
    setSelectedElementIds(duplicates.map((element) => element.id)); setSelectedElementId(duplicates.at(-1)?.id ?? null);
  };
  const alignSelected = (axis: "x" | "y") => {
    const elements = plan.layout.elements.filter((element) => selectedElementIds.includes(element.id) && !element.locked); if (elements.length < 2) return;
    const center = elements.reduce((total, element) => total + (axis === "x" ? element.x + element.width / 2 : element.y + element.height / 2), 0) / elements.length;
    updateSelectedElements((element) => element.locked ? element : clampElementToPage({ ...element, [axis]: center - (axis === "x" ? element.width : element.height) / 2 }, plan.layout));
  };
  const distributeSelected = (axis: "x" | "y") => {
    const elements = plan.layout.elements.filter((element) => selectedElementIds.includes(element.id) && !element.locked).sort((left, right) => left[axis] - right[axis]);
    if (elements.length < 3) return;
    const firstCenter = elements[0][axis] + (axis === "x" ? elements[0].width : elements[0].height) / 2;
    const last = elements[elements.length - 1];
    const lastCenter = last[axis] + (axis === "x" ? last.width : last.height) / 2;
    const step = (lastCenter - firstCenter) / (elements.length - 1);
    const positions = new Map(elements.map((element, index) => [element.id, firstCenter + step * index]));
    updateSelectedElements((element) => {
      const center = positions.get(element.id); if (center === undefined || element.locked) return element;
      return clampElementToPage({ ...element, [axis]: center - (axis === "x" ? element.width : element.height) / 2 }, plan.layout);
    });
  };
  const latestRevision = database.revisions.find((revision) => revision.projectId === project.id);
  const handlePublish = (event: FormEvent) => { event.preventDefault(); const revision = publishPlan(plan.id, publishInput); setPublishedIndex(revision.index); setPublishOpen(false); };
  const selectedElementLabel = selectedElement?.kind === "block" && selectedBlock && selectedData
    ? selectedData.item.customTitle?.[locale] ?? selectedBlock.translations[locale].title
    : selectedElement?.kind === "shape" ? t(`editor.shape.${selectedElement.shape}`)
    : selectedElement ? t(`editor.element.${selectedElement.kind}`) : "";

  return <DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className={`editor-page ${libraryOpen ? "" : "library-collapsed"}`}>
    <header className="editor-toolbar">
      <div className="editor-toolbar-leading">
        <button className="icon-button" onClick={() => setLibraryOpen((open) => !open)} aria-label={t("editor.toggleLibrary")} title={t("editor.toggleLibrary")}>{libraryOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
        <div className="editor-toolbar-title"><strong>{t("editor.plan")}</strong><span>{t("editor.blocks", { count: presentBlockIds.size })} · A0 {t("editor.landscape")}</span></div>
      </div>
      <div className="toolbar-selection-slot">
        {selectedElementIds.length > 0 && <div className="editor-toolbar-group selection-tools">
          <span className="selected-element-label" title={selectedElementLabel}>{selectedElementIds.length === 1 ? selectedElementLabel : t("editor.selectedCount", { count: selectedElementIds.length })}</span>
          {selectedElementIds.length >= 2 && <><button className="icon-button" onClick={() => alignSelected("x")} aria-label={t("editor.alignHorizontal")} title={t("editor.alignHorizontal")}><AlignCenterHorizontal size={16} /></button><button className="icon-button" onClick={() => alignSelected("y")} aria-label={t("editor.alignVertical")} title={t("editor.alignVertical")}><AlignCenterVertical size={16} /></button></>}
          {selectedElementIds.length >= 3 && <><button className="icon-button" onClick={() => distributeSelected("x")} aria-label={t("editor.distributeHorizontal")} title={t("editor.distributeHorizontal")}><AlignHorizontalDistributeCenter size={16} /></button><button className="icon-button" onClick={() => distributeSelected("y")} aria-label={t("editor.distributeVertical")} title={t("editor.distributeVertical")}><AlignVerticalDistributeCenter size={16} /></button></>}
          {selectedAnnotation && <div className="toolbar-popover-wrap" data-toolbar-popover>
            <button className="icon-button" onClick={() => { setStyleOpen((open) => !open); setInsertOpen(false); setValidationOpen(false); }} aria-expanded={styleOpen} aria-label={t("editor.formatAnnotation")} title={t("editor.formatAnnotation")}><Palette size={16} /></button>
            {styleOpen && <AnnotationStylePopover element={selectedAnnotation} onChange={updateSelectedAnnotationStyle} onBringToFront={() => moveSelectedAnnotationToLayerEdge("front")} onSendToBack={() => moveSelectedAnnotationToLayerEdge("back")} t={t} />}
          </div>}
          <button className="icon-button" onClick={() => updateSelectedElements((element) => ({ ...element, locked: !element.locked }))} aria-label={selectedElement?.locked ? t("editor.unlock") : t("editor.lock")} title={selectedElement?.locked ? t("editor.unlock") : t("editor.lock")}>{selectedElement?.locked ? <Unlock size={16} /> : <Lock size={16} />}</button>
          <button className="icon-button" onClick={duplicateSelectedElements} aria-label={t("common.duplicate")} title={t("common.duplicate")}><Copy size={16} /></button>
          <button className="icon-button" onClick={removeSelectedElements} disabled={selectedElementIds.every((id) => plan.layout.elements.find((candidate) => candidate.id === id)?.kind === "title_block")} aria-label={t("editor.remove")} title={t("editor.remove")}><Trash2 size={16} /></button>
        </div>}
      </div>
      <div className="editor-toolbar-primary">
        <div className="toolbar-popover-wrap" data-toolbar-popover>
          <Button className={activeInsertTool ? "is-active" : undefined} variant="secondary" size="small" onClick={() => { setInsertOpen((open) => !open); setStyleOpen(false); setValidationOpen(false); }} aria-expanded={insertOpen} aria-label={t("editor.insert")} title={t("editor.insert")}><Plus size={15} /><span className="toolbar-action-label">{t("editor.insert")}</span><ChevronDown className="toolbar-action-label" size={12} /></Button>
          {insertOpen && <InsertAnnotationPopover onSelect={(tool) => { setActiveInsertTool(tool); setInsertOpen(false); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]); setEditing(null); }} t={t} />}
        </div>
        <div className="editor-toolbar-group block-layout-tools">
          <Button variant="ghost" size="small" onClick={selectOrCreateBlockArea} aria-label={blockArea ? t("editor.editBlockArea") : t("editor.defineBlockArea")} title={blockArea ? t("editor.editBlockArea") : t("editor.defineBlockArea")}><Scan size={15} /><span className="toolbar-action-label">{blockArea ? t("editor.blockArea") : t("editor.defineBlockArea")}</span></Button>
          <select className="block-layout-mode-select" aria-label={t("editor.blockLayoutMode")} value={blockArea?.layoutMode ?? "best_fit"} onChange={(event) => updateBlockLayoutMode(event.target.value as BlockLayoutMode)} disabled={!blockArea}>
            <option value="vertical">{t("editor.layoutVertical")}</option><option value="horizontal">{t("editor.layoutHorizontal")}</option><option value="best_fit">{t("editor.layoutBestFit")}</option>
          </select>
          <Button aria-label={t("editor.fitBlocks")} title={t("editor.fitBlocks")} variant="secondary" size="small" onClick={fitBlocks} disabled={!blockArea || presentBlockIds.size === 0}><LayoutGrid size={15} /><span className="toolbar-action-label">{t("editor.fitBlocks")}</span></Button>
        </div>
        <div className="editor-toolbar-group toolbar-viewport"><Button className="fit-plan-action" variant="ghost" size="small" onClick={fitPlan} title={`${t("editor.fitPlan")} · ⇧1`} aria-label={t("editor.fitPlan")}><Maximize2 size={15} /><span className="toolbar-action-label">{t("editor.fitPlan")}</span></Button><button className="icon-button" onClick={() => setZoomAroundPoint(stepCanvasZoom(zoom, "out"))} disabled={zoom <= MIN_CANVAS_ZOOM} aria-label={t("editor.zoomOut")} title={t("editor.zoomOut")}><ZoomOut size={17} /></button><Badge>{Math.round(zoom * 100)}%</Badge><button className="icon-button" onClick={() => setZoomAroundPoint(stepCanvasZoom(zoom, "in"))} disabled={zoom >= MAX_CANVAS_ZOOM} aria-label={t("editor.zoomIn")} title={t("editor.zoomIn")}><ZoomIn size={17} /></button></div>
      </div>
      <div className="editor-toolbar-trailing">
        <div className="editor-toolbar-group toolbar-history"><button className="icon-button" onClick={undo} disabled={!past.length} aria-label={`${t("editor.undo")} (⌘Z / Ctrl+Z)`} title={`${t("editor.undo")} (⌘Z / Ctrl+Z)`}><Undo2 size={16} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label={`${t("editor.redo")} (⇧⌘Z / Ctrl+Y)`} title={`${t("editor.redo")} (⇧⌘Z / Ctrl+Y)`}><Redo2 size={16} /></button></div>
        <div className="toolbar-popover-wrap" data-toolbar-popover>
          <button ref={validationTriggerRef} className="button button-secondary button-small" onClick={() => { setValidationOpen((open) => !open); setInsertOpen(false); setStyleOpen(false); }} aria-expanded={validationOpen} aria-label={t("editor.validation")} title={t("editor.validation")}><TriangleAlert size={14} /><span className="toolbar-action-label">{t("editor.validation")}</span><Badge tone={blockingValidationIssues.length ? "danger" : warningValidationIssues.length ? "warning" : "success"}>{validationIssues.filter((issue) => issue.severity !== "information").length}</Badge></button>
          {validationOpen && <ValidationPopover issues={validationIssues} onNavigate={navigateToIssue} t={t} />}
        </div>
        <Button className="toolbar-export-action" variant="secondary" size="small" aria-label="A0 PDF" title="A0 PDF" onClick={() => void import("../export/exports").then(({ exportPlanPdf }) => exportPlanPdf(project, plan, database.blocks, database.categories, locale, latestRevision))}>A0</Button>
        <Button className="toolbar-export-action" variant="secondary" size="small" aria-label={t("editor.wordDocuments")} title={t("editor.wordDocuments")} disabled={wordPlanGenerating} onClick={() => void createWordPlan()}>A4</Button>
        <Button size="small" aria-label={t("editor.publish")} title={t("editor.publish")} onClick={() => { setPublishInput((current) => ({ ...current, approvedBy: project.participants.find((participant) => participant.role === "coordinator")?.name ?? "" })); setPublishOpen(true); }} disabled={blockingValidationIssues.length > 0}><ShieldCheck size={14} /><span className="toolbar-action-label">{t("editor.publish")}</span></Button>
      </div>
    </header>
    {publishedIndex && <span className="save-indicator is-published"><CheckCircle2 size={13} />{t("publish.success", { index: publishedIndex })}</span>}
    {wordPlanMessage && <div className={`asset-message editor-word-message is-${wordPlanMessage.tone}`} role={wordPlanMessage.tone === "danger" ? "alert" : "status"}>{wordPlanMessage.text}</div>}
    <div className="editor-workspace">
      {libraryOpen && <aside className="editor-sidebar"><div className="editor-pane-header"><div className="editor-pane-heading"><h2>{t("editor.catalog")}</h2></div><div className="search-shell"><Search size={15} /><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("editor.searchBlocks")} aria-label={t("editor.searchBlocks")} /></div></div><div className="editor-library"><CategoryLibrary categories={database.categories.filter((category) => category.lifecycle === "active")} blocks={activeBlocks} expanded={expandedCategories} locale={locale} presentBlockIds={presentBlockIds} onToggle={(id) => setExpandedCategories((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAdd={(id) => addBlock(id)} t={t} /><LibraryGroup title={t("editor.projectFiles")} defaultOpen>{project.assets.filter((asset) => asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf").map((asset) => <DraggableLibraryItem key={asset.id} id={`asset:${asset.id}`} title={asset.filename} subtitle={asset.mimeType === "application/pdf" ? t("editor.pdfPageOne") : t("editor.imageFile")} icon={asset.mimeType === "application/pdf" ? <FileOutput size={16} /> : <Image size={16} />} onAdd={() => addAsset(asset.id)} addLabel={t("common.add")} />)}</LibraryGroup></div></aside>}
      <main ref={canvasShellRef} className="editor-canvas-shell">
        {blockFitMessage && <div className="block-fit-message" role="status"><TriangleAlert size={14} />{blockFitMessage}</div>}
        <div className="canvas-stage" style={{ width: A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT * zoom, height: A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT * zoom }}>
          <PlanCanvas ref={canvasRef} plan={plan} project={project} locale={locale} zoom={zoom} blockMap={blockMap} categoryMap={categoryMap} selectedIds={selectedElementIds} editing={editing} activeInsertTool={activeInsertTool} focusedIssueElementId={focusedIssueElementId} setElementRef={(id, element) => { if (element) elementRefs.current.set(id, element); else elementRefs.current.delete(id); }} onInsert={addAnnotation} onSelect={(element) => { setSelectedElementId(element.id); setSelectedElementIds([element.id]); if (element.kind === "block") setSelected({ sectionId: element.sectionId, itemId: element.itemId, elementId: element.id }); else setSelected(null); }} onClearSelection={() => { setEditing(null); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]); }} onEditStart={(elementId, field) => setEditing({ elementId, field })} onEditCommit={commitInlineEdit} onEditCancel={() => setEditing(null)} t={t} />
        </div>
        <Selecto
          dragContainer=".editor-canvas-shell"
          selectableTargets={activeInsertTool ? [] : [".canvas-element[data-element-id]"]}
          selectByClick={!activeInsertTool}
          selectFromInside={false}
          toggleContinueSelect={["shift"]}
          hitRate={10}
          onSelectEnd={(event) => {
            const inputEvent = event.inputEvent as MouseEvent | PointerEvent | undefined;
            const inlineTarget = inputEvent
              ? document.elementsFromPoint(inputEvent.clientX, inputEvent.clientY)
                .map((candidate) => candidate.closest<HTMLElement>("[data-inline-field]"))
                .find((candidate): candidate is HTMLElement => Boolean(candidate))
              : undefined;
            const inlineField = inlineTarget?.dataset.inlineField as InlineField | undefined;
            const clickedElementId = inlineTarget?.closest<HTMLElement>(".canvas-element[data-element-id]")?.dataset.elementId;
            const selectedIds = event.selected.map((element) => (element as HTMLElement).dataset.elementId).filter((id): id is string => Boolean(id));
            const currentInlineClick = typeof clickedElementId === "string" && typeof inlineField === "string" ? { elementId: clickedElementId, field: inlineField } : null;
            const previousInlineClick = lastInlineClick.current;
            const matchingDoubleClick = event.isDouble && (inputEvent?.detail ?? 0) >= 2 && previousInlineClick && (!currentInlineClick || (currentInlineClick.elementId === previousInlineClick.elementId && currentInlineClick.field === previousInlineClick.field));
            if (currentInlineClick) lastInlineClick.current = currentInlineClick;
            const inlineSelection = matchingDoubleClick ? previousInlineClick : null;
            const ids = inlineSelection ? [inlineSelection.elementId] : selectedIds;
            setSelectedElementIds(ids); setSelectedElementId(ids.at(-1) ?? null);
            const primary = plan.layout.elements.find((element) => element.id === ids.at(-1));
            if (primary?.kind === "block") setSelected({ sectionId: primary.sectionId, itemId: primary.itemId, elementId: primary.id }); else setSelected(null);
            if (event.isDouble && primary && inlineSelection) {
              setEditing({ elementId: primary.id, field: inlineSelection.field });
            }
          }}
        />
        {selectedElement && selectedTarget && !selectedElement.locked && selectedTargets.length === 1 && !editing && <Moveable
          key={`single-${selectedElement.id}-${moveableRevision}`}
          ref={moveableRef as React.Ref<never>}
          target={selectedTarget}
          flushSync={flushSync}
          useResizeObserver
          useMutationObserver
          draggable resizable throttleDrag={1} throttleResize={1} origin={false} keepRatio={false}
          snappable snapGridWidth={2} snapGridHeight={2} verticalGuidelines={[0, A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT / 2, A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT]} horizontalGuidelines={[0, A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT / 2, A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT]}
          onDragStart={() => { transformSnapshot.current = structuredClone(plan); }}
          onDrag={({ target, transform }) => { target.style.transform = transform; }}
          onDragEnd={({ target }) => { const bounds = readElementBounds(target); target.style.transform = ""; if (!bounds) return; flushSync(() => finishTransform(clampElementToPage({ ...selectedElement, x: bounds.x, y: bounds.y }, plan.layout))); setMoveableRevision((revision) => revision + 1); }}
          onResizeStart={({ direction, set, setMin, setMax }) => {
            transformSnapshot.current = structuredClone(plan);
            const sessionElement = structuredClone(selectedElement);
            const minimum = minimumElementSize(sessionElement);
            const initialWidth = sessionElement.width * CSS_PIXELS_PER_LAYOUT_UNIT;
            const initialHeight = sessionElement.height * CSS_PIXELS_PER_LAYOUT_UNIT;
            const maximumWidth = (direction[0] < 0
              ? sessionElement.x + sessionElement.width - plan.layout.safeMargin
              : plan.layout.width - plan.layout.safeMargin - sessionElement.x) * CSS_PIXELS_PER_LAYOUT_UNIT;
            const maximumHeight = (direction[1] < 0
              ? sessionElement.y + sessionElement.height - plan.layout.safeMargin
              : plan.layout.height - plan.layout.safeMargin - sessionElement.y) * CSS_PIXELS_PER_LAYOUT_UNIT;
            set([initialWidth, initialHeight]);
            setMin([
              direction[0] === 0 ? initialWidth : minimum.width * CSS_PIXELS_PER_LAYOUT_UNIT,
              direction[1] === 0 ? initialHeight : minimum.height * CSS_PIXELS_PER_LAYOUT_UNIT,
            ]);
            setMax([
              direction[0] === 0 ? initialWidth : maximumWidth,
              direction[1] === 0 ? initialHeight : maximumHeight,
            ]);
            resizeSession.current = { element: sessionElement };
          }}
          onResize={(event) => {
            const session = resizeSession.current;
            if (!session) return;
            const measurement = resizeMeasurementFromMoveableEvent(session.element, event);
            const resizedElement = resizeElementFromCssMeasurement(session.element, plan.layout, measurement);
            session.latestElement = resizedElement;
            applyResizePreview(event.target, session.element, resizedElement, measurement);
          }}
          onResizeEnd={({ target, lastEvent }) => {
            const session = resizeSession.current;
            const resizedElement = session && lastEvent
              ? resizeElementFromCssMeasurement(session.element, plan.layout, resizeMeasurementFromMoveableEvent(session.element, lastEvent as OnResize))
              : session?.latestElement;
            target.style.transform = "";
            resizeSession.current = null;
            if (!session || !resizedElement) return;
            flushSync(() => finishTransform(resizedElement));
            setBlockFitMessage("");
            setMoveableRevision((revision) => revision + 1);
          }}
        />}
        {unlockedSelectedTargets.length > 1 && !editing && <Moveable
          key={`group-${selectedElementIds.join("-")}-${moveableRevision}`}
          ref={moveableRef as React.Ref<never>}
          target={unlockedSelectedTargets}
          flushSync={flushSync}
          useResizeObserver
          useMutationObserver
          draggable resizable origin={false} keepRatio={false} snappable snapGridWidth={2} snapGridHeight={2}
          onDragGroupStart={() => { groupTransform.current.clear(); }}
          onDragGroup={({ events }) => events.forEach((item) => {
            item.target.style.transform = `translate(${item.beforeTranslate[0]}px, ${item.beforeTranslate[1]}px)`;
            const id = (item.target as HTMLElement).dataset.elementId; if (id) groupTransform.current.set(id, { dx: item.beforeTranslate[0], dy: item.beforeTranslate[1] });
          })}
          onDragGroupEnd={({ targets }) => {
            const boundsById = new Map(targets.flatMap((target) => { const htmlTarget = target as HTMLElement; const id = htmlTarget.dataset.elementId; const bounds = readElementBounds(htmlTarget); return id && bounds ? [[id, bounds] as const] : []; }));
            targets.forEach((target) => { (target as HTMLElement).style.transform = ""; }); groupTransform.current.clear();
            flushSync(() => applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => {
              const bounds = boundsById.get(element.id); return bounds ? clampElementToPage({ ...element, x: bounds.x, y: bounds.y }, plan.layout) : element;
            }) } })); setMoveableRevision((revision) => revision + 1);
          }}
          onResizeGroupStart={() => { groupResizeElements.current.clear(); }}
          onResizeGroup={({ events }) => events.forEach((item) => {
            const id = (item.target as HTMLElement).dataset.elementId;
            const element = id ? plan.layout.elements.find((candidate) => candidate.id === id) : undefined;
            if (!id || !element) return;
            const measurement = resizeMeasurementFromMoveableEvent(element, item);
            const resizedElement = resizeElementFromCssMeasurement(element, plan.layout, measurement);
            applyResizePreview(item.target, element, resizedElement, measurement);
            groupResizeElements.current.set(id, resizedElement);
          })}
          onResizeGroupEnd={({ targets }) => {
            targets.forEach((target) => { (target as HTMLElement).style.transform = ""; });
            const resizedElements = new Map(groupResizeElements.current);
            groupResizeElements.current.clear();
            flushSync(() => applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => {
              return resizedElements.get(element.id) ?? element;
            }) } })); setMoveableRevision((revision) => revision + 1);
          }}
        />}
      </main>
    </div>
    <Modal open={publishOpen} title={t("publish.title")} onClose={() => setPublishOpen(false)}><form onSubmit={handlePublish}><div className="modal-body"><p className="page-description">{t("publish.subtitle")}</p>{warningValidationIssues.length > 0 && <div className="publish-warning-list">{warningValidationIssues.map((issue) => <p key={issue.id}><TriangleAlert size={14} /><span><strong>{issue.title}</strong>{issue.description}</span></p>)}</div>}<div className="form-grid"><label className="field"><span>{t("publish.index")}</span><input required value={publishInput.index} onChange={(event) => setPublishInput((current) => ({ ...current, index: event.target.value }))} /></label><label className="field"><span>{t("publish.approver")}</span><input required value={publishInput.approvedBy} onChange={(event) => setPublishInput((current) => ({ ...current, approvedBy: event.target.value }))} /></label><label className="field span-two"><span>{t("publish.summary")}</span><textarea required value={publishInput.changeSummary} onChange={(event) => setPublishInput((current) => ({ ...current, changeSummary: event.target.value }))} /></label></div></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>{t("common.cancel")}</Button><Button type="submit">{t("publish.confirm")}</Button></div></form></Modal>
    <Modal open={Boolean(pendingWordPlan)} title={t("documents.missingTitle")} onClose={() => setPendingWordPlan(null)}><div className="modal-body"><p>{t("documents.missingText")}</p><ul className="missing-placeholder-list">{pendingWordPlan?.missingPlaceholders.map((placeholder) => <li key={placeholder}><code>{`{{${placeholder}}}`}</code></li>)}</ul><p>{t("documents.missingChoice")}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setPendingWordPlan(null)}>{t("documents.returnToProject")}</Button><Button disabled={wordPlanGenerating} onClick={() => void proceedWithMissingWordPlaceholders()}>{wordPlanGenerating ? t("documents.generating") : t("documents.proceedEmpty")}</Button></div></Modal>
  </div></DndContext>;
}

function CategoryLibrary({ categories, blocks, expanded, locale, presentBlockIds, onToggle, onAdd, t, parentId, depth = 0 }: { categories: BuildingBlockCategory[]; blocks: ReturnType<typeof useApp>["database"]["blocks"]; expanded: Set<string>; locale: "de" | "en"; presentBlockIds: Set<string>; onToggle: (id: string) => void; onAdd: (id: string) => void; t: (key: string) => string; parentId?: string; depth?: number }) {
  const visibleCategories = categories
    .filter((category) => category.parentId === parentId)
    .sort((first, second) => first.sortOrder - second.sortOrder);

  return <>{visibleCategories.map((category) => {
    const categoryBlocks = blocks.filter((block) => block.primaryCategoryId === category.id);
    const descendantIds = categoryDescendantIds(category.id, categories);
    const totalBlocks = blocks.filter((block) => descendantIds.has(block.primaryCategoryId)).length;
    if (!totalBlocks) return null;
    const open = expanded.has(category.id);
    return <div className="library-category" key={category.id}>
      <button
        className="library-category-header"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onToggle(category.id)}
        aria-expanded={open}
      >
        <span style={{ backgroundColor: categoryHierarchyColor(category.id, categories) }} />
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <strong>{category.translations[locale].name}</strong>
        <small>{totalBlocks}</small>
      </button>
      {open && <>
        <div className="library-category-blocks is-tree-blocks">
          {categoryBlocks.map((block) => <DraggableLibraryItem
            key={`${category.id}-${block.id}`}
            id={`block:${block.id}`}
            title={block.translations[locale].title}
            compact
            indent={28 + depth * 14}
            added={presentBlockIds.has(block.id)}
            onAdd={() => onAdd(block.id)}
            addLabel={t("common.add")}
            addedLabel={t("project.included")}
          />)}
        </div>
        <CategoryLibrary categories={categories} blocks={blocks} expanded={expanded} locale={locale} presentBlockIds={presentBlockIds} onToggle={onToggle} onAdd={onAdd} t={t} parentId={category.id} depth={depth + 1} />
      </>}
    </div>;
  })}</>;
}

function LibraryGroup({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) { const [open, setOpen] = useState(defaultOpen); return <div className="library-group"><button className="library-category-header" onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{title}</strong></button>{open && <div className="library-category-blocks">{children}</div>}</div>; }

function DraggableLibraryItem({ id, title, subtitle, icon, compact = false, indent, added = false, onAdd, addLabel, addedLabel = addLabel }: { id: string; title: string; subtitle?: string; icon?: React.ReactNode; compact?: boolean; indent?: number; added?: boolean; onAdd: () => void; addLabel: string; addedLabel?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: added });
  return <article ref={setNodeRef} className={`editor-catalog-card ${compact ? "is-compact" : ""} ${added ? "is-added" : ""} ${isDragging ? "is-dragging" : ""}`} style={{ paddingLeft: indent, transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}>
    <button type="button" className="library-drag-handle" disabled={added} {...attributes} {...listeners}>
      {icon && <span className="library-drag-icon">{icon}</span>}
      <span className="library-drag-copy"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</span>
    </button>
    <button type="button" className={`icon-button ${added ? "library-item-added" : ""}`} aria-label={`${added ? addedLabel : addLabel}: ${title}`} title={added ? addedLabel : addLabel} disabled={added} onClick={onAdd}>{added ? <Check size={compact ? 12 : 15} /> : <Plus size={compact ? 12 : 15} />}</button>
  </article>;
}

const PlanCanvas = function PlanCanvas({ ref, plan, project, locale, zoom, blockMap, categoryMap, selectedIds, editing, activeInsertTool, focusedIssueElementId, setElementRef, onInsert, onSelect, onClearSelection, onEditStart, onEditCommit, onEditCancel, t }: {
  ref: React.Ref<HTMLDivElement>;
  plan: Plan;
  project: NonNullable<ReturnType<typeof useApp>["database"]["projects"][number]>;
  locale: "de" | "en";
  zoom: number;
  blockMap: Map<string, ReturnType<typeof useApp>["database"]["blocks"][number]>;
  categoryMap: Map<string, BuildingBlockCategory>;
  selectedIds: string[];
  editing: InlineEditingState | null;
  activeInsertTool: AnnotationInsertTool | null;
  focusedIssueElementId: string | null;
  setElementRef: (id: string, element: HTMLElement | null) => void;
  onInsert: (tool: AnnotationInsertTool, bounds: AnnotationBounds) => void;
  onSelect: (element: PlanElement) => void;
  onClearSelection: () => void;
  onEditStart: (elementId: string, field: InlineField) => void;
  onEditCommit: (elementId: string, field: InlineField, value: string) => void;
  onEditCancel: () => void;
  t: (key: string) => string;
}) {
  const { setNodeRef } = useDroppable({ id: "plan-canvas" });
  const [annotationDraft, setAnnotationDraft] = useState<AnnotationDraft | null>(null);
  const annotationDraftRef = useRef<AnnotationDraft | null>(null);
  const combinedRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof ref === "function") ref(node); else if (ref) ref.current = node;
  };
  const pointFromPointer = (event: React.PointerEvent<HTMLDivElement>): AnnotationPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: snapToGrid(Math.max(0, Math.min(plan.layout.width, (event.clientX - bounds.left) * plan.layout.width / bounds.width)), plan.layout.gridSize),
      y: snapToGrid(Math.max(0, Math.min(plan.layout.height, (event.clientY - bounds.top) * plan.layout.height / bounds.height)), plan.layout.gridSize),
    };
  };
  const updateAnnotationDraft = (draft: AnnotationDraft | null) => {
    annotationDraftRef.current = draft;
    setAnnotationDraft(draft);
  };
  const finishAnnotationDraft = (event: React.PointerEvent<HTMLDivElement>) => {
    const draft = annotationDraftRef.current;
    if (!activeInsertTool || !draft || draft.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const current = pointFromPointer(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    updateAnnotationDraft(null);
    const isConnector = activeInsertTool === "line" || activeInsertTool === "arrow";
    if (isConnector && !isMeaningfulAnnotationDrag(draft.start, current)) return;
    onInsert(activeInsertTool, annotationBoundsFromDrag(activeInsertTool, draft.start, current, plan.layout.gridSize));
  };
  const connectorGestureIsPending = Boolean(
    annotationDraft
    && (activeInsertTool === "line" || activeInsertTool === "arrow")
    && !isMeaningfulAnnotationDrag(annotationDraft.start, annotationDraft.current),
  );
  const previewBounds = activeInsertTool && annotationDraft && !connectorGestureIsPending
    ? annotationBoundsFromDrag(activeInsertTool, annotationDraft.start, annotationDraft.current, plan.layout.gridSize)
    : null;
  return <div
    ref={combinedRef}
    className={`wysiwyg-page ${activeInsertTool ? "is-inserting" : ""}`}
    style={{ transform: `scale(${zoom})` }}
    onPointerDownCapture={(event) => {
      if (!activeInsertTool || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const start = pointFromPointer(event);
      event.currentTarget.setPointerCapture(event.pointerId);
      updateAnnotationDraft({ pointerId: event.pointerId, start, current: start });
    }}
    onPointerMoveCapture={(event) => {
      const draft = annotationDraftRef.current;
      if (!activeInsertTool || !draft || draft.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      updateAnnotationDraft({ ...draft, current: pointFromPointer(event) });
    }}
    onPointerUpCapture={finishAnnotationDraft}
    onPointerCancelCapture={(event) => {
      if (annotationDraftRef.current?.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      updateAnnotationDraft(null);
    }}
    onPointerDown={(event) => { if (!activeInsertTool && event.target === event.currentTarget) onClearSelection(); }}
  >
    {plan.layout.elements.filter((element) => !element.hidden).map((element) => <PlanElementView
      key={element.id}
      element={element}
      plan={plan}
      project={project}
      locale={locale}
      blockMap={blockMap}
      categoryMap={categoryMap}
      selected={selectedIds.includes(element.id)}
      editing={editing}
      focused={focusedIssueElementId === element.id}
      setRef={(node) => setElementRef(element.id, node)}
      onSelect={() => onSelect(element)}
      onEditStart={(field) => { onSelect(element); onEditStart(element.id, field); }}
      onEditCommit={(field, value) => onEditCommit(element.id, field, value)}
      onEditCancel={onEditCancel}
      t={t}
    />)}
    {activeInsertTool && previewBounds && <AnnotationInsertPreview tool={activeInsertTool} bounds={previewBounds} />}
  </div>;
};

function AnnotationInsertPreview({ tool, bounds }: { tool: AnnotationInsertTool; bounds: AnnotationBounds }) {
  const style: React.CSSProperties = {
    left: bounds.x * CSS_PIXELS_PER_LAYOUT_UNIT,
    top: bounds.y * CSS_PIXELS_PER_LAYOUT_UNIT,
    width: bounds.width * CSS_PIXELS_PER_LAYOUT_UNIT,
    height: bounds.height * CSS_PIXELS_PER_LAYOUT_UNIT,
  };
  return <div className={`canvas-insert-preview is-${tool}`} style={style}>
    {(tool === "line" || tool === "arrow") && <AnnotationConnectorGraphic arrow={tool === "arrow"} color="#296c5d" strokeWidth={2} markerId={`preview-${tool}`} start={bounds.connectorStart} end={bounds.connectorEnd} />}
  </div>;
}

const DEFAULT_CONNECTOR_START: PlanConnectorPoint = { x: 0, y: 0.5 };
const DEFAULT_CONNECTOR_END: PlanConnectorPoint = { x: 1, y: 0.5 };

function AnnotationConnectorGraphic({ arrow, color, strokeWidth, markerId, start = DEFAULT_CONNECTOR_START, end = DEFAULT_CONNECTOR_END }: { arrow: boolean; color: string; strokeWidth: number; markerId: string; start?: PlanConnectorPoint; end?: PlanConnectorPoint }) {
  return <svg className="canvas-connector-graphic" aria-hidden="true">
    {arrow && <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill={color} /></marker></defs>}
    <line x1={`${start.x * 100}%`} y1={`${start.y * 100}%`} x2={`${end.x * 100}%`} y2={`${end.y * 100}%`} stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" markerEnd={arrow ? `url(#${markerId})` : undefined} />
  </svg>;
}

function annotationVisualStyle(element: PlanTextElement | PlanShapeElement): React.CSSProperties {
  return {
    color: element.textColor ?? "#12241f",
    backgroundColor: element.fillColor ?? "transparent",
    border: element.strokeColor ? `${element.strokeWidth ?? 1}px solid ${element.strokeColor}` : "none",
    fontSize: `${element.fontSize ?? 9}px`,
    fontWeight: element.fontWeight ?? "normal",
    textAlign: element.textAlign ?? "left",
    opacity: element.opacity ?? 1,
  };
}

function PlanElementView({ element, plan, project, locale, blockMap, categoryMap, selected, editing, focused, setRef, onSelect, onEditStart, onEditCommit, onEditCancel, t }: {
  element: PlanElement;
  plan: Plan;
  project: ReturnType<typeof useApp>["database"]["projects"][number];
  locale: "de" | "en";
  blockMap: Map<string, ReturnType<typeof useApp>["database"]["blocks"][number]>;
  categoryMap: Map<string, BuildingBlockCategory>;
  selected: boolean;
  editing: InlineEditingState | null;
  focused: boolean;
  setRef: (node: HTMLElement | null) => void;
  onSelect: () => void;
  onEditStart: (field: InlineField) => void;
  onEditCommit: (field: InlineField, value: string) => void;
  onEditCancel: () => void;
  t: (key: string) => string;
}) {
  const style: React.CSSProperties = { left: element.x * CSS_PIXELS_PER_LAYOUT_UNIT, top: element.y * CSS_PIXELS_PER_LAYOUT_UNIT, width: element.width * CSS_PIXELS_PER_LAYOUT_UNIT, height: element.height * CSS_PIXELS_PER_LAYOUT_UNIT, zIndex: element.zIndex };
  const interactiveProps = {
    ref: setRef,
    "data-element-id": element.id,
    "data-locked": String(Boolean(element.locked)),
    tabIndex: -1,
    className: `canvas-element ${selected ? "is-selected" : ""} ${focused ? "is-validation-focus" : ""}`,
    style,
    onClick: (event: React.MouseEvent) => { event.stopPropagation(); onSelect(); },
  };
  const isEditing = (field: InlineField) => editing?.elementId === element.id && editing.field === field;
  if (element.kind === "block_area") {
    return <div {...interactiveProps} role="button" aria-pressed={selected} aria-label={t("editor.blockArea")} className={`${interactiveProps.className} canvas-block-area`}><span>{t("editor.blockArea")}</span></div>;
  }
  if (element.kind === "header") {
    const status = plan.status === "published" ? translate(locale, "status.published") : translate(locale, "editor.workingDraft");
    return <header {...interactiveProps} className={`${interactiveProps.className} plan-header canvas-plan-header`}>
      <div>
        <InlineText field="brandText" className="plan-header-brand" value={element.brandText?.[locale] ?? "QUICKSiGe"} editing={isEditing("brandText")} onStart={() => onEditStart("brandText")} onCommit={(value) => onEditCommit("brandText", value)} onCancel={onEditCancel} label={t("editor.headerBrand")} />
        <InlineText field="titleText" className="plan-header-title" value={element.titleText?.[locale] ?? t("editor.planTitle")} editing={isEditing("titleText")} onStart={() => onEditStart("titleText")} onCommit={(value) => onEditCommit("titleText", value)} onCancel={onEditCancel} label={t("editor.headerTitle")} />
      </div>
      <div className="plan-header-meta">
        <InlineText field="projectNameText" className="plan-header-project" value={element.projectNameText?.[locale] ?? project.name} editing={isEditing("projectNameText")} onStart={() => onEditStart("projectNameText")} onCommit={(value) => onEditCommit("projectNameText", value)} onCancel={onEditCancel} label={t("editor.headerProject")} />
        <InlineText field="projectDetailsText" value={element.projectDetailsText?.[locale] ?? `${project.projectNumber} · ${project.address}, ${project.city}`} editing={isEditing("projectDetailsText")} onStart={() => onEditStart("projectDetailsText")} onCommit={(value) => onEditCommit("projectDetailsText", value)} onCancel={onEditCancel} label={t("editor.headerDetails")} />
        <InlineText field="statusText" value={element.statusText?.[locale] ?? status} editing={isEditing("statusText")} onStart={() => onEditStart("statusText")} onCommit={(value) => onEditCommit("statusText", value)} onCancel={onEditCancel} label={t("editor.headerStatus")} />
      </div>
    </header>;
  }
  if (element.kind === "section") { const section = plan.sections.find((candidate) => candidate.id === element.sectionId); const category = section && categoryMap.get(section.categoryId); if (!section || !category) return null; const categories = [...categoryMap.values()]; const sectionColor = categoryHierarchyColor(category.id, categories); const title = section.titleOverrides?.[locale] ?? category.translations[locale].name; return <section {...interactiveProps} data-category-id={category.id} className={`${interactiveProps.className} canvas-section`}><div style={{ backgroundColor: sectionColor, color: readableTextColor(sectionColor) }}><InlineText field="sectionTitle" value={title} editing={isEditing("sectionTitle")} onStart={() => onEditStart("sectionTitle")} onCommit={(value) => onEditCommit("sectionTitle", value)} onCancel={onEditCancel} label={t("editor.sectionTitle")} /></div></section>; }
  if (element.kind === "block") { const section = plan.sections.find((candidate) => candidate.id === element.sectionId); const item = section?.items.find((candidate) => candidate.id === element.itemId); const block = item && blockMap.get(item.blockId); if (!item || !block) return null; const content = block.translations[locale]; const imageDataUrl = item.imageDataUrl ?? block.imageDataUrl; const title = item.customTitle?.[locale] ?? content.title; const description = item.customShortDescription?.[locale] ?? content.shortDescription; const blockColor = blockHierarchyColor(block, [...categoryMap.values()]); return <div {...interactiveProps} data-block-id={block.id} role="button" aria-pressed={selected} className={`${interactiveProps.className} canvas-block`}><span className="canvas-block-title" style={{ backgroundColor: blockColor, color: readableTextColor(blockColor) }}><InlineText field="blockTitle" value={title} editing={isEditing("blockTitle")} onStart={() => onEditStart("blockTitle")} onCommit={(value) => onEditCommit("blockTitle", value)} onCancel={onEditCancel} label={t("editor.visibleTitle")} /></span><span className="canvas-block-content">{imageDataUrl ? <img className="canvas-block-image" src={imageDataUrl} alt="" /> : <BlockVisual visualKey={block.visualKey} color={blockColor} size="small" />}<InlineText field="blockDescription" value={description} editing={isEditing("blockDescription")} multiline onStart={() => onEditStart("blockDescription")} onCommit={(value) => onEditCommit("blockDescription", value)} onCancel={onEditCancel} label={t("editor.visibleDescription")} /></span><span className="canvas-block-references">{block.regulations.join(" · ")}</span></div>; }
  if (element.kind === "image" || element.kind === "pdf_page") { const asset = project.assets.find((candidate) => candidate.id === element.assetId); if (!asset) return null; return <div {...interactiveProps} className={`${interactiveProps.className} canvas-asset`}><CanvasAssetImage asset={asset} pdfPage={element.kind === "pdf_page"} pageNumber={element.pageNumber} fitMode={element.fitMode} crop={element.crop} t={t} /></div>; }
  if (element.kind === "document") {
    const variant = element.displayVariant ?? "compact";
    return <div {...interactiveProps} className={`${interactiveProps.className} canvas-document variant-${variant}`}><FileOutput size={22} /><strong>{t(`documents.${element.documentType}`)}</strong>{variant === "emergency_card" && <span>{project.emergencyContacts.slice(0, 3).map((contact) => `${contact.label}: ${contact.phone}`).join(" · ") || "—"}</span>}{variant === "participant_list" && <span>{project.participants.slice(0, 4).map((participant) => `${participant.name} · ${participant.company}`).join(" · ") || "—"}</span>}{variant === "qr_link" && <span className="qr-placeholder" aria-label={t("editor.qrPlaceholder")}>QR</span>}</div>;
  }
  if (element.kind === "shape") {
    if (element.shape === "line" || element.shape === "arrow") {
      return <div {...interactiveProps} className={`${interactiveProps.className} canvas-shape canvas-connector is-${element.shape}`} style={{ ...interactiveProps.style, opacity: element.opacity ?? 1 }}><AnnotationConnectorGraphic arrow={element.shape === "arrow"} color={element.strokeColor ?? "#296c5d"} strokeWidth={element.strokeWidth ?? 2} markerId={`annotation-${element.id}`} start={element.connectorStart} end={element.connectorEnd} /></div>;
    }
    const visualStyle = annotationVisualStyle(element);
    return <div {...interactiveProps} className={`${interactiveProps.className} canvas-shape is-${element.shape}`} style={{ ...interactiveProps.style, ...visualStyle }}>
      {element.shape === "callout" && <InlineText field="text" value={element.text?.[locale] ?? ""} editing={isEditing("text")} multiline onStart={() => onEditStart("text")} onCommit={(value) => onEditCommit("text", value)} onCancel={onEditCancel} label={t("editor.textContent")} />}
    </div>;
  }
  if (element.kind === "title_block") { const coordinator = project.participants.find((participant) => participant.role === "coordinator")?.name ?? "—"; return <div {...interactiveProps} className={`${interactiveProps.className} canvas-title-block`}><InlineText field="projectNameText" className="title-block-project" value={element.projectNameText?.[locale] ?? project.name} editing={isEditing("projectNameText")} onStart={() => onEditStart("projectNameText")} onCommit={(value) => onEditCommit("projectNameText", value)} onCancel={onEditCancel} label={t("editor.titleBlockProject")} /><InlineText field="coordinatorText" value={element.coordinatorText?.[locale] ?? coordinator} editing={isEditing("coordinatorText")} onStart={() => onEditStart("coordinatorText")} onCommit={(value) => onEditCommit("coordinatorText", value)} onCancel={onEditCancel} label={t("editor.titleBlockCoordinator")} /><InlineText field="referenceText" value={element.referenceText?.[locale] ?? `${project.projectNumber} · A0`} editing={isEditing("referenceText")} onStart={() => onEditStart("referenceText")} onCommit={(value) => onEditCommit("referenceText", value)} onCancel={onEditCancel} label={t("editor.titleBlockReference")} /></div>; }
  if (element.kind === "text") return <div {...interactiveProps} className={`${interactiveProps.className} canvas-text`} style={{ ...interactiveProps.style, ...annotationVisualStyle(element) }}><InlineText field="text" value={element.text[locale] ?? ""} editing={isEditing("text")} multiline onStart={() => onEditStart("text")} onCommit={(value) => onEditCommit("text", value)} onCancel={onEditCancel} label={t("editor.textContent")} /></div>;
  return null;
}

function InlineText({ value, editing, field, multiline = false, className, onStart, onCommit, onCancel, label }: { value: string; editing: boolean; field: InlineField; multiline?: boolean; className?: string; onStart: () => void; onCommit: (value: string) => void; onCancel: () => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => { setDraft(value); }, [value, editing]);
  if (!editing) return <span className={className} data-inline-field={field} onDoubleClick={(event) => { event.stopPropagation(); onStart(); }}>{value}</span>;
  const sharedProps = {
    autoFocus: true,
    className: `canvas-inline-editor ${className ?? ""}`,
    value: draft,
    "aria-label": label,
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: () => { if (!cancelled.current) onCommit(draft); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") { cancelled.current = true; event.preventDefault(); onCancel(); }
      if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) { event.preventDefault(); onCommit(draft); }
    },
  };
  return multiline ? <textarea {...sharedProps} /> : <input {...sharedProps} />;
}

function InsertAnnotationPopover({ onSelect, t }: { onSelect: (tool: AnnotationInsertTool) => void; t: (key: string) => string }) {
  const tools: Array<{ tool: AnnotationInsertTool; icon: React.ReactNode; shortcut?: string }> = [
    { tool: "text", icon: <Type size={16} />, shortcut: "T" },
    { tool: "rectangle", icon: <RectangleHorizontal size={16} />, shortcut: "R" },
    { tool: "line", icon: <Minus size={16} /> },
    { tool: "arrow", icon: <ArrowRight size={16} /> },
    { tool: "callout", icon: <MessageSquare size={16} /> },
  ];
  return <div className="toolbar-popover insert-popover" role="menu" aria-label={t("editor.insert")}>
    <div className="toolbar-popover-heading"><strong>{t("editor.insert")}</strong><span>{t("editor.insertHelp")}</span></div>
    <div className="insert-tool-list">{tools.map(({ tool, icon, shortcut }) => <button type="button" role="menuitem" key={tool} onClick={() => onSelect(tool)}>{icon}<span>{t(`editor.shape.${tool}`)}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>)}</div>
  </div>;
}

function AnnotationStylePopover({ element, onChange, onBringToFront, onSendToBack, t }: {
  element: PlanTextElement | PlanShapeElement;
  onChange: (patch: Partial<PlanAnnotationStyle>) => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  t: (key: string) => string;
}) {
  const isConnector = element.kind === "shape" && (element.shape === "line" || element.shape === "arrow");
  const supportsText = element.kind === "text" || (element.kind === "shape" && element.shape === "callout");
  return <div className="toolbar-popover annotation-style-popover" role="dialog" aria-label={t("editor.formatAnnotation")}>
    <div className="toolbar-popover-heading"><strong>{t("editor.formatAnnotation")}</strong><span>{t("editor.formatAnnotationHelp")}</span></div>
    {!isConnector && <div className="annotation-style-row">
      <label className="annotation-style-toggle"><input type="checkbox" checked={Boolean(element.fillColor)} onChange={(event) => onChange({ fillColor: event.target.checked ? element.fillColor ?? "#fff4b8" : undefined })} />{t("editor.fill")}</label>
      <input type="color" value={element.fillColor ?? "#fff4b8"} disabled={!element.fillColor} onChange={(event) => onChange({ fillColor: event.target.value })} aria-label={t("editor.fillColor")} />
    </div>}
    <div className="annotation-style-row">
      <label className="annotation-style-toggle"><input type="checkbox" checked={Boolean(element.strokeColor)} onChange={(event) => onChange({ strokeColor: event.target.checked ? element.strokeColor ?? "#296c5d" : undefined })} />{t("editor.stroke")}</label>
      <input type="color" value={element.strokeColor ?? "#296c5d"} disabled={!element.strokeColor} onChange={(event) => onChange({ strokeColor: event.target.value })} aria-label={t("editor.strokeColor")} />
      <select value={element.strokeWidth ?? 1} disabled={!element.strokeColor} onChange={(event) => onChange({ strokeWidth: Number(event.target.value) })} aria-label={t("editor.strokeWidth")}><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="4">4 px</option></select>
    </div>
    {supportsText && <>
      <div className="annotation-style-row"><label>{t("editor.textColor")}</label><input type="color" value={element.textColor ?? "#12241f"} onChange={(event) => onChange({ textColor: event.target.value })} aria-label={t("editor.textColor")} /><select value={element.fontSize ?? 9} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} aria-label={t("editor.fontSize")}><option value="7">7</option><option value="9">9</option><option value="11">11</option><option value="14">14</option><option value="18">18</option></select></div>
      <div className="annotation-style-actions" aria-label={t("editor.textFormatting")}>
        <button type="button" className={element.fontWeight === "bold" ? "is-active" : ""} onClick={() => onChange({ fontWeight: element.fontWeight === "bold" ? "normal" : "bold" })} aria-label={t("editor.bold")} title={t("editor.bold")}><Bold size={15} /></button>
        <button type="button" className={(element.textAlign ?? "left") === "left" ? "is-active" : ""} onClick={() => onChange({ textAlign: "left" })} aria-label={t("editor.alignTextLeft")} title={t("editor.alignTextLeft")}><AlignLeft size={15} /></button>
        <button type="button" className={element.textAlign === "center" ? "is-active" : ""} onClick={() => onChange({ textAlign: "center" })} aria-label={t("editor.alignTextCenter")} title={t("editor.alignTextCenter")}><AlignCenter size={15} /></button>
        <button type="button" className={element.textAlign === "right" ? "is-active" : ""} onClick={() => onChange({ textAlign: "right" })} aria-label={t("editor.alignTextRight")} title={t("editor.alignTextRight")}><AlignRight size={15} /></button>
      </div>
    </>}
    <label className="annotation-opacity"><span>{t("editor.opacity")}</span><input type="range" min="20" max="100" step="10" value={Math.round((element.opacity ?? 1) * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} /><output>{Math.round((element.opacity ?? 1) * 100)}%</output></label>
    <div className="annotation-layer-actions"><button type="button" onClick={onBringToFront}><BringToFront size={15} />{t("editor.bringToFront")}</button><button type="button" onClick={onSendToBack}><SendToBack size={15} />{t("editor.sendToBack")}</button></div>
  </div>;
}

function ValidationPopover({ issues, onNavigate, t }: { issues: PlanValidationIssue[]; onNavigate: (issue: PlanValidationIssue) => void; t: (key: string, params?: Record<string, string | number>) => string }) {
  const actionableIssues = issues.filter((issue) => issue.severity !== "information");
  return <div className="toolbar-popover validation-popover" role="dialog" aria-label={t("editor.validation")}>
    <div className="toolbar-popover-heading"><strong>{t("editor.validation")}</strong><span>{actionableIssues.length ? t("editor.validationIssues", { count: actionableIssues.length }) : t("editor.validationReady")}</span></div>
    <div className="validation-list">{issues.map((issue) => <button type="button" className={`validation-item is-${issue.severity}`} key={issue.id} onClick={() => issue.elementId && onNavigate(issue)} disabled={!issue.elementId}>
      <span className="validation-icon">{issue.severity === "information" ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}</span>
      <span><small>{t(`editor.validation.severity.${issue.severity}`)}</small><strong>{issue.title}</strong><span>{issue.description}</span>{issue.suggestedAction && <em>{issue.suggestedAction}</em>}</span>
    </button>)}</div>
  </div>;
}

function CanvasAssetImage({ asset, pdfPage, pageNumber, fitMode, crop, t }: { asset: Project["assets"][number]; pdfPage: boolean; pageNumber?: number; fitMode?: "contain" | "cover"; crop?: { x: number; y: number; width: number; height: number }; t: (key: string) => string }) {
  const [url, setUrl] = useState(pdfPage ? asset.previewDataUrl : asset.dataUrl);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const resolvePreview = async () => {
      if (pdfPage && asset.blobId && (pageNumber ?? 1) > 1) {
        const blob = await getBlob(asset.blobId); if (blob) return renderPdfPage(blob, pageNumber ?? 1);
      }
      if (pdfPage && asset.dataUrl && (pageNumber ?? 1) > 1) {
        return renderPdfPage(await (await fetch(asset.dataUrl)).blob(), pageNumber ?? 1);
      }
      return blobObjectUrl(pdfPage ? asset.previewBlobId : asset.blobId, pdfPage ? asset.previewDataUrl : asset.dataUrl);
    };
    void resolvePreview().then((next) => {
      if (!active) { if (next?.startsWith("blob:")) URL.revokeObjectURL(next); return; }
      objectUrl = next; setUrl(next);
    });
    return () => { active = false; if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl); };
  }, [asset, pdfPage, pageNumber]);
  return url ? <img src={url} alt={asset.filename} style={{ objectFit: fitMode ?? "contain", objectPosition: `${crop?.x ?? 50}% ${crop?.y ?? 50}%` }} /> : <div className="pdf-page-placeholder"><FileOutput size={28} /><strong>{asset.filename}</strong><span>PDF · {t("editor.page")} {pageNumber ?? 1}</span></div>;
}
