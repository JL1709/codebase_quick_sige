import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Copy, FileOutput, Image, Lock, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Search, ShieldCheck,
  Trash2, TriangleAlert, Type, Undo2, Unlock, ZoomIn, ZoomOut,
} from "lucide-react";
import Moveable from "react-moveable";
import Selecto from "react-selecto";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BlockVisual } from "../components/BlockVisual";
import { Badge, Button, EmptyState, Modal } from "../components/Ui";
import { blobObjectUrl, getBlob } from "../data/blobRepository";
import { renderPdfPage } from "../documents/pdfPreview";
import { A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createSectionElement, CSS_PIXELS_PER_LAYOUT_UNIT, findNextFreeBlockPosition, snapToGrid } from "../domain/planLayout";
import { readValidatedImageDataUrl } from "../domain/projectAssets";
import type { BuildingBlock, BuildingBlockCategory, Plan, PlanBlockElement, PlanElement, PlanItem, PlanSection, Project, SupportingDocumentType } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { translate } from "../i18n/translations";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.15;
const ZOOM_STEP = 0.08;
const documentTypes: SupportingDocumentType[] = ["site_rules", "alarm_plan", "fire_safety", "first_aid", "participants", "advance_notice"];

interface SelectedBlock { sectionId: string; itemId: string; elementId: string }

function findItem(plan: Plan, selected: SelectedBlock | null): { section: PlanSection; item: PlanItem; element: PlanBlockElement } | null {
  if (!selected) return null;
  const section = plan.sections.find((candidate) => candidate.id === selected.sectionId);
  const item = section?.items.find((candidate) => candidate.id === selected.itemId);
  const element = plan.layout.elements.find((candidate): candidate is PlanBlockElement => candidate.kind === "block" && candidate.id === selected.elementId);
  return section && item && element ? { section, item, element } : null;
}

export function PlanEditorPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, getPlanForProject, updatePlan, publishPlan } = useApp();
  const { t } = useI18n();
  const project = getProject(projectId);
  const storedPlan = getPlanForProject(projectId);
  const [plan, setPlan] = useState<Plan | null>(storedPlan ? structuredClone(storedPlan) : null);
  const [past, setPast] = useState<Plan[]>([]);
  const [future, setFuture] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<SelectedBlock | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"properties" | "validation">("properties");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishInput, setPublishInput] = useState(() => ({ index: String.fromCharCode(65 + database.revisions.filter((revision) => revision.projectId === projectId).length), changeSummary: "", approvedBy: "" }));
  const [publishedIndex, setPublishedIndex] = useState("");
  const [zoom, setZoom] = useState(0.7);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState(() => {
    const saved = window.localStorage.getItem("quicksige.plan-library.expanded");
    return new Set<string>(saved ? JSON.parse(saved) as string[] : database.categories.filter((category) => !category.parentId).map((category) => category.id));
  });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const elementRefs = useRef(new Map<string, HTMLElement>());
  const transformSnapshot = useRef<Plan | null>(null);
  const groupTransform = useRef(new Map<string, { dx: number; dy: number; width?: number; height?: number }>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const blockMap = useMemo(() => new Map(database.blocks.map((block) => [block.id, block])), [database.blocks]);
  const categoryMap = useMemo(() => new Map(database.categories.map((category) => [category.id, category])), [database.categories]);
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
      if (command && (key === "z" || key === "y")) {
        event.preventDefault(); if (key === "y" || event.shiftKey) redo(); else undo(); return;
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

  if (!project) return <NotFoundPage />;
  if (!plan) return <div className="workspace-page"><EmptyState icon={<ShieldCheck />} title={t("project.noPlan")} text={t("project.noPlanText")} /></div>;

  const presentBlockIds = new Set(plan.sections.flatMap((section) => section.items.map((item) => item.blockId)));
  const blockUsageCounts = plan.sections.flatMap((section) => section.items).reduce((counts, item) => counts.set(item.blockId, (counts.get(item.blockId) ?? 0) + 1), new Map<string, number>());
  const normalizedSearch = search.trim().toLocaleLowerCase(plan.documentLocale);
  const activeBlocks = database.blocks.filter((block) => {
    const localized = block.translations[plan.documentLocale];
    const searchCorpus = [block.code, localized.title, localized.shortDescription, localized.longDescription, ...localized.searchTerms, ...block.tags, ...block.regulations].join(" ").toLocaleLowerCase(plan.documentLocale);
    return block.lifecycle === "active" && searchCorpus.includes(normalizedSearch);
  });
  const printWarnings = plan.layout.elements.flatMap((element) => {
    const outsideSafeArea = element.x < plan.layout.safeMargin || element.y < plan.layout.safeMargin
      || element.x + element.width > plan.layout.width - plan.layout.safeMargin
      || element.y + element.height > plan.layout.height - plan.layout.safeMargin;
    const asset = (element.kind === "image" || element.kind === "pdf_page") ? project.assets.find((candidate) => candidate.id === element.assetId) : undefined;
    const lowResolution = element.kind === "image" && asset?.width && asset?.height
      ? asset.width / (element.width / 10 / 25.4) < 150 || asset.height / (element.height / 10 / 25.4) < 150
      : false;
    const item = element.kind === "block"
      ? plan.sections.find((section) => section.id === element.sectionId)?.items.find((candidate) => candidate.id === element.itemId)
      : undefined;
    const block = item ? blockMap.get(item.blockId) : undefined;
    const visibleText = item && block ? item.customShortDescription?.[plan.documentLocale] ?? block.translations[plan.documentLocale].shortDescription : "";
    const estimatedTextCapacity = Math.max(40, Math.floor((element.width / 120) * (element.height / 150)));
    const clippedContent = element.kind === "block" && visibleText.length > estimatedTextCapacity;
    const belowPrintThreshold = (element.kind === "block" || element.kind === "text") && (element.width < 800 || element.height < 280);
    return [
      ...(outsideSafeArea ? [t("editor.outsideSafeArea")] : []),
      ...(lowResolution ? [t("editor.lowResolution", { filename: asset?.filename ?? "" })] : []),
      ...(clippedContent ? [t("editor.clippedContent")] : []),
      ...(belowPrintThreshold ? [t("editor.smallPrintText")] : []),
    ];
  });
  const blockingValidationIssues = [
    ...(presentBlockIds.size === 0 ? [t("editor.noBlocks")] : []),
    ...(!project.participants.some((participant) => participant.role === "coordinator") ? [t("editor.missingCoordinator")] : []),
    ...database.documentConfigurations.filter((configuration) => configuration.projectId === project.id).flatMap((configuration) => {
      const template = database.documentTemplates.find((candidate) => candidate.id === configuration.templateId);
      return !template || template.validation?.status === "invalid" ? [t("editor.invalidTemplate")] : [];
    }),
  ];
  const warningValidationIssues = [
    ...(project.emergencyContacts.length === 0 ? [t("editor.missingEmergency")] : []),
    ...printWarnings,
  ];
  const informationValidationIssues = [t("editor.validationInfo", {
    assets: project.assets.length,
    templates: database.documentConfigurations.filter((configuration) => configuration.projectId === project.id).length,
  })];
  const validationIssues = [...blockingValidationIssues, ...warningValidationIssues];

  const addBlock = (blockId: string, requestedPosition?: { x: number; y: number }) => {
    const block = blockMap.get(blockId); if (!block) return;
    const item: PlanItem = { id: newId("item"), blockId };
    let targetSection = plan.sections.find((section) => section.categoryId === block.primaryCategoryId);
    const sectionWasCreated = !targetSection;
    const sections = targetSection ? plan.sections.map((section) => section.id === targetSection?.id ? { ...section, items: [...section.items, item] } : section) : [...plan.sections, { id: newId("section"), categoryId: block.primaryCategoryId, items: [item] }];
    targetSection = sections.find((section) => section.items.some((candidate) => candidate.id === item.id));
    if (!targetSection) return;
    const free = findNextFreeBlockPosition(plan.layout);
    const element: PlanBlockElement = clampElementToPage({ id: newId("layout-block"), kind: "block", sectionId: targetSection.id, itemId: item.id, blockId, x: requestedPosition?.x ?? free.x, y: requestedPosition?.y ?? free.y, width: free.width, height: free.height, zIndex: 500 + plan.layout.elements.length, semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1 }, plan.layout) as PlanBlockElement;
    const sectionElement = sectionWasCreated ? createSectionElement(targetSection.id, plan.layout, element.y) : undefined;
    applyPlan({ ...plan, sections, layout: { ...plan.layout, elements: [...plan.layout.elements, ...(sectionElement ? [sectionElement] : []), element] } });
    setSelected({ sectionId: targetSection.id, itemId: item.id, elementId: element.id });
    setSelectedElementId(element.id);
    setSelectedElementIds([element.id]);
  };
  const addAsset = (assetId: string, requestedPosition?: { x: number; y: number }) => {
    const asset = project.assets.find((candidate) => candidate.id === assetId); if (!asset) return;
    const free = findNextFreeBlockPosition(plan.layout, 2_500, 1_600);
    const element = clampElementToPage({ id: newId("layout-asset"), kind: asset.mimeType === "application/pdf" ? "pdf_page" : "image", assetId, pageNumber: asset.mimeType === "application/pdf" ? 1 : undefined, x: requestedPosition?.x ?? free.x, y: requestedPosition?.y ?? free.y, width: free.width, height: free.height, zIndex: 700 + plan.layout.elements.length, semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1 }, plan.layout);
    applyPlan({ ...plan, includedAssetIds: [...new Set([...plan.includedAssetIds, assetId])], layout: { ...plan.layout, elements: [...plan.layout.elements, element] } });
    setSelectedElementId(element.id); setSelectedElementIds([element.id]); setSelected(null);
  };
  const addDocument = (documentType: SupportingDocumentType, requestedPosition?: { x: number; y: number }) => {
    const free = findNextFreeBlockPosition(plan.layout, 2_300, 700);
    const element = clampElementToPage({ id: newId("layout-document"), kind: "document", documentType, displayVariant: documentType === "participants" ? "participant_list" : ["alarm_plan", "first_aid", "fire_safety"].includes(documentType) ? "emergency_card" : "compact", x: requestedPosition?.x ?? free.x, y: requestedPosition?.y ?? free.y, width: free.width, height: free.height, zIndex: 650 + plan.layout.elements.length, semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1 }, plan.layout);
    applyPlan({ ...plan, layout: { ...plan.layout, elements: [...plan.layout.elements, element] } });
    setSelectedElementId(element.id); setSelectedElementIds([element.id]); setSelected(null);
  };
  const addText = (requestedPosition?: { x: number; y: number }) => {
    const free = findNextFreeBlockPosition(plan.layout, 2_300, 520);
    const element = clampElementToPage({
      id: newId("layout-text"), kind: "text", text: { de: "Hinweis", en: "Note" },
      x: requestedPosition?.x ?? free.x, y: requestedPosition?.y ?? free.y,
      width: free.width, height: free.height, zIndex: 680 + plan.layout.elements.length,
      semanticOrder: Math.max(0, ...plan.layout.elements.map((candidate) => candidate.semanticOrder ?? 0)) + 1,
    }, plan.layout);
    applyPlan({ ...plan, layout: { ...plan.layout, elements: [...plan.layout.elements, element] } });
    setSelectedElementId(element.id); setSelectedElementIds([element.id]); setSelected(null);
  };
  const addLibraryItem = (id: string, position?: { x: number; y: number }) => {
    const [kind, value] = id.split(":", 2);
    if (kind === "block") addBlock(value, position);
    else if (kind === "asset") addAsset(value, position);
    else if (kind === "document") addDocument(value as SupportingDocumentType, position);
    else if (kind === "text") addText(position);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over?.id !== "plan-canvas" || !event.active.rect.current.translated || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const translated = event.active.rect.current.translated;
    const x = (translated.left + translated.width / 2 - canvasRect.left) * plan.layout.width / canvasRect.width;
    const y = (translated.top + translated.height / 2 - canvasRect.top) * plan.layout.height / canvasRect.height;
    addLibraryItem(String(event.active.id), { x: snapToGrid(x - 1_150), y: snapToGrid(y - 360) });
  };
  const updateSelectedItem = (patch: Partial<PlanItem>) => {
    if (!selectedData) return;
    applyPlan({ ...plan, sections: plan.sections.map((section) => section.id === selectedData.section.id ? { ...section, items: section.items.map((item) => item.id === selectedData.item.id ? { ...item, ...patch } : item) } : section) });
  };
  const updateElement = (elementId: string, patch: Partial<PlanElement>) => {
    applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => element.id === elementId ? { ...element, ...patch } as PlanElement : element) } });
  };
  const updateSection = (sectionId: string, patch: Partial<PlanSection>) => {
    applyPlan({ ...plan, sections: plan.sections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) });
  };
  const removeElement = (elementId: string) => {
    const element = plan.layout.elements.find((candidate) => candidate.id === elementId); if (!element) return;
    const sections = element.kind === "block" ? plan.sections.map((section) => ({ ...section, items: section.items.filter((item) => item.id !== element.itemId) })) : plan.sections;
    applyPlan({ ...plan, sections, layout: { ...plan.layout, elements: plan.layout.elements.filter((candidate) => candidate.id !== elementId) } }); setSelected(null); setSelectedElementId(null); setSelectedElementIds([]);
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
      const targetSectionElement = plan.layout.elements.find((candidate) => candidate.kind === "section" && center.x >= candidate.x && center.x <= candidate.x + candidate.width && center.y >= candidate.y && center.y <= candidate.y + candidate.height);
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
  const selectedElement = selectedElementId ? plan.layout.elements.find((element) => element.id === selectedElementId) : undefined;
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
      } else if (element.kind !== "title_block") {
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

  return <DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className={`editor-page ${libraryOpen ? "" : "library-collapsed"} ${inspectorOpen ? "" : "inspector-collapsed"}`}>
    <header className="editor-toolbar">
      <button className="icon-button" onClick={() => setLibraryOpen((open) => !open)} aria-label={t("editor.toggleLibrary")}>{libraryOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
      <div className="editor-toolbar-title"><strong>{t("editor.plan")}</strong><span>{t("editor.blocks", { count: presentBlockIds.size })} · A0 {t("editor.landscape")}</span></div>
      <div className="editor-toolbar-group"><button className="icon-button" onClick={undo} disabled={!past.length} aria-label={`${t("editor.undo")} (⌘Z / Ctrl+Z)`}><Undo2 size={16} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label={`${t("editor.redo")} (⇧⌘Z / Ctrl+Y)`}><Redo2 size={16} /></button></div>
      {selectedElementIds.length > 0 && <div className="editor-toolbar-group selection-tools">
        <button className="icon-button" onClick={() => alignSelected("x")} disabled={selectedElementIds.length < 2} aria-label={t("editor.alignHorizontal")}><AlignCenterHorizontal size={16} /></button>
        <button className="icon-button" onClick={() => alignSelected("y")} disabled={selectedElementIds.length < 2} aria-label={t("editor.alignVertical")}><AlignCenterVertical size={16} /></button>
        <button className="icon-button" onClick={() => distributeSelected("x")} disabled={selectedElementIds.length < 3} aria-label={t("editor.distributeHorizontal")}><AlignHorizontalDistributeCenter size={16} /></button>
        <button className="icon-button" onClick={() => distributeSelected("y")} disabled={selectedElementIds.length < 3} aria-label={t("editor.distributeVertical")}><AlignVerticalDistributeCenter size={16} /></button>
        <button className="icon-button" onClick={() => updateSelectedElements((element) => ({ ...element, zIndex: element.zIndex + 1 }))} aria-label={t("editor.bringForward")}><ArrowUp size={16} /></button>
        <button className="icon-button" onClick={() => updateSelectedElements((element) => ({ ...element, zIndex: Math.max(0, element.zIndex - 1) }))} aria-label={t("editor.sendBackward")}><ArrowDown size={16} /></button>
        <button className="icon-button" onClick={() => updateSelectedElements((element) => ({ ...element, locked: !element.locked }))} aria-label={selectedElement?.locked ? t("editor.unlock") : t("editor.lock")}>{selectedElement?.locked ? <Unlock size={16} /> : <Lock size={16} />}</button>
        <button className="icon-button" onClick={duplicateSelectedElements} aria-label={t("common.duplicate")}><Copy size={16} /></button>
        <button className="icon-button" onClick={removeSelectedElements} aria-label={t("editor.remove")}><Trash2 size={16} /></button>
      </div>}
      <div className="editor-toolbar-group"><Button variant="ghost" size="small" onClick={() => setZoom(0.55)}>{t("editor.fit")}</Button><Button variant="ghost" size="small" onClick={() => setZoom(1)}>100%</Button><button className="icon-button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))} aria-label={t("editor.zoomOut")}><ZoomOut size={17} /></button><Badge>{Math.round(zoom * 100)}%</Badge><button className="icon-button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))} aria-label={t("editor.zoomIn")}><ZoomIn size={17} /></button></div>
      <span className="save-indicator"><CheckCircle2 size={13} />{publishedIndex ? t("publish.success", { index: publishedIndex }) : t("editor.saveStatus")}</span>
      <Button variant="secondary" size="small" onClick={() => void import("../export/exports").then(({ exportPlanPdf }) => exportPlanPdf(project, plan, database.blocks, database.categories, latestRevision))}>A0 PDF</Button>
      <Link to={`/projects/${project.id}/documents`}><Button variant="secondary" size="small"><FileOutput size={14} />{t("editor.wordDocuments")}</Button></Link>
      <Button size="small" onClick={() => { setPublishInput((current) => ({ ...current, approvedBy: project.participants.find((participant) => participant.role === "coordinator")?.name ?? "" })); setPublishOpen(true); }} disabled={blockingValidationIssues.length > 0}><ShieldCheck size={14} />{t("editor.publish")}</Button>
      <button className="icon-button" onClick={() => setInspectorOpen((open) => !open)} aria-label={t("editor.toggleInspector")}>{inspectorOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button>
    </header>
    <div className="editor-workspace">
      {libraryOpen && <aside className="editor-sidebar"><div className="editor-pane-header"><h2>{t("editor.catalog")}</h2><div className="search-shell"><Search size={15} /><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("editor.searchBlocks")} aria-label={t("editor.searchBlocks")} /></div></div><div className="editor-library"><CategoryLibrary categories={database.categories.filter((category) => category.lifecycle === "active")} blocks={activeBlocks} expanded={expandedCategories} locale={plan.documentLocale} usageCounts={blockUsageCounts} onToggle={(id) => setExpandedCategories((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onAdd={(id) => addBlock(id)} t={t} /><LibraryGroup title={t("editor.projectFiles")} defaultOpen>{project.assets.map((asset) => <DraggableLibraryItem key={asset.id} id={`asset:${asset.id}`} title={asset.filename} subtitle={asset.mimeType === "application/pdf" ? t("editor.pdfPageOne") : t("editor.imageFile")} icon={asset.mimeType === "application/pdf" ? <FileOutput size={16} /> : <Image size={16} />} onAdd={() => addAsset(asset.id)} addLabel={t("common.add")} />)}</LibraryGroup><LibraryGroup title={t("editor.documentElements")}>{documentTypes.map((type) => <DraggableLibraryItem key={type} id={`document:${type}`} title={t(`documents.${type}`)} subtitle={t("editor.placeDocument")} icon={<FileOutput size={16} />} onAdd={() => addDocument(type)} addLabel={t("common.add")} />)}</LibraryGroup><LibraryGroup title={t("editor.annotations")}><DraggableLibraryItem id="text:note" title={t("editor.textNote")} subtitle={t("editor.placeText")} icon={<Type size={16} />} onAdd={() => addText()} addLabel={t("common.add")} /></LibraryGroup></div></aside>}
      <main className="editor-canvas-shell">
        <div className="canvas-stage" style={{ width: A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT * zoom, height: A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT * zoom }}>
          <PlanCanvas ref={canvasRef} plan={plan} project={project} zoom={zoom} blockMap={blockMap} categoryMap={categoryMap} selectedIds={selectedElementIds} setElementRef={(id, element) => { if (element) elementRefs.current.set(id, element); else elementRefs.current.delete(id); }} onSelect={(element) => { setSelectedElementId(element.id); setSelectedElementIds([element.id]); if (element.kind === "block") setSelected({ sectionId: element.sectionId, itemId: element.itemId, elementId: element.id }); else setSelected(null); }} t={t} />
        </div>
        <Selecto
          dragContainer=".editor-canvas-shell"
          selectableTargets={[".canvas-element[data-element-id]"]}
          selectByClick
          selectFromInside={false}
          toggleContinueSelect={["shift"]}
          hitRate={10}
          onSelectEnd={(event) => {
            const ids = event.selected.map((element) => (element as HTMLElement).dataset.elementId).filter((id): id is string => Boolean(id));
            setSelectedElementIds(ids); setSelectedElementId(ids.at(-1) ?? null);
            const primary = plan.layout.elements.find((element) => element.id === ids.at(-1));
            if (primary?.kind === "block") setSelected({ sectionId: primary.sectionId, itemId: primary.itemId, elementId: primary.id }); else setSelected(null);
          }}
        />
        {selectedElement && selectedTarget && !selectedElement.locked && selectedTargets.length === 1 && <Moveable
          target={selectedTarget}
          draggable resizable throttleDrag={1} throttleResize={1} origin={false} keepRatio={false}
          snappable snapGridWidth={2} snapGridHeight={2} verticalGuidelines={[0, A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT / 2, A0_LANDSCAPE_WIDTH * CSS_PIXELS_PER_LAYOUT_UNIT]} horizontalGuidelines={[0, A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT / 2, A0_LANDSCAPE_HEIGHT * CSS_PIXELS_PER_LAYOUT_UNIT]}
          onDragStart={() => { transformSnapshot.current = structuredClone(plan); }}
          onDrag={({ target, beforeTranslate }) => { target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)`; }}
          onDragEnd={({ target, lastEvent }) => { if (!lastEvent) return; target.style.transform = ""; finishTransform(clampElementToPage({ ...selectedElement, x: selectedElement.x + lastEvent.beforeTranslate[0] / CSS_PIXELS_PER_LAYOUT_UNIT, y: selectedElement.y + lastEvent.beforeTranslate[1] / CSS_PIXELS_PER_LAYOUT_UNIT }, plan.layout)); }}
          onResizeStart={() => { transformSnapshot.current = structuredClone(plan); }}
          onResize={({ target, width, height, drag }) => { target.style.width = `${width}px`; target.style.height = `${height}px`; target.style.transform = drag.transform; }}
          onResizeEnd={({ target, lastEvent }) => { if (!lastEvent) return; target.style.transform = ""; finishTransform(clampElementToPage({ ...selectedElement, x: selectedElement.x + lastEvent.drag.beforeTranslate[0] / CSS_PIXELS_PER_LAYOUT_UNIT, y: selectedElement.y + lastEvent.drag.beforeTranslate[1] / CSS_PIXELS_PER_LAYOUT_UNIT, width: Math.max(600, lastEvent.width / CSS_PIXELS_PER_LAYOUT_UNIT), height: Math.max(240, lastEvent.height / CSS_PIXELS_PER_LAYOUT_UNIT) }, plan.layout)); }}
        />}
        {unlockedSelectedTargets.length > 1 && <Moveable
          target={unlockedSelectedTargets}
          draggable resizable origin={false} keepRatio={false} snappable snapGridWidth={2} snapGridHeight={2}
          onDragGroupStart={() => { groupTransform.current.clear(); }}
          onDragGroup={({ events }) => events.forEach((item) => {
            item.target.style.transform = `translate(${item.beforeTranslate[0]}px, ${item.beforeTranslate[1]}px)`;
            const id = (item.target as HTMLElement).dataset.elementId; if (id) groupTransform.current.set(id, { dx: item.beforeTranslate[0], dy: item.beforeTranslate[1] });
          })}
          onDragGroupEnd={({ targets }) => {
            targets.forEach((target) => { (target as HTMLElement).style.transform = ""; });
            const changes = new Map(groupTransform.current); groupTransform.current.clear();
            applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => {
              const change = changes.get(element.id); return change ? clampElementToPage({ ...element, x: element.x + change.dx / CSS_PIXELS_PER_LAYOUT_UNIT, y: element.y + change.dy / CSS_PIXELS_PER_LAYOUT_UNIT }, plan.layout) : element;
            }) } });
          }}
          onResizeGroupStart={() => { groupTransform.current.clear(); }}
          onResizeGroup={({ events }) => events.forEach((item) => {
            item.target.style.width = `${item.width}px`; item.target.style.height = `${item.height}px`; item.target.style.transform = item.drag.transform;
            const id = (item.target as HTMLElement).dataset.elementId; if (id) groupTransform.current.set(id, { dx: item.drag.beforeTranslate[0], dy: item.drag.beforeTranslate[1], width: item.width, height: item.height });
          })}
          onResizeGroupEnd={({ targets }) => {
            targets.forEach((target) => { const htmlTarget = target as HTMLElement; htmlTarget.style.transform = ""; htmlTarget.style.width = ""; htmlTarget.style.height = ""; });
            const changes = new Map(groupTransform.current); groupTransform.current.clear();
            applyPlan({ ...plan, layout: { ...plan.layout, elements: plan.layout.elements.map((element) => {
              const change = changes.get(element.id); return change ? clampElementToPage({ ...element, x: element.x + change.dx / CSS_PIXELS_PER_LAYOUT_UNIT, y: element.y + change.dy / CSS_PIXELS_PER_LAYOUT_UNIT, width: Math.max(600, (change.width ?? element.width * CSS_PIXELS_PER_LAYOUT_UNIT) / CSS_PIXELS_PER_LAYOUT_UNIT), height: Math.max(240, (change.height ?? element.height * CSS_PIXELS_PER_LAYOUT_UNIT) / CSS_PIXELS_PER_LAYOUT_UNIT) }, plan.layout) : element;
            }) } });
          }}
        />}
      </main>
      {inspectorOpen && <aside className="editor-inspector"><div className="editor-pane-header"><div className="inspector-tabs"><button className={inspectorTab === "properties" ? "is-active" : ""} onClick={() => setInspectorTab("properties")}>{t("editor.inspector")}</button><button className={inspectorTab === "validation" ? "is-active" : ""} onClick={() => setInspectorTab("validation")}>{t("editor.validation")} {validationIssues.length > 0 && <Badge tone="warning">{validationIssues.length}</Badge>}</button></div></div>{inspectorTab === "properties" ? <div className="inspector-body">{selectedElement ? <ElementInspector element={selectedElement} plan={plan} project={project} block={selectedBlock} selectedData={selectedData} onUpdateElement={(patch) => updateElement(selectedElement.id, patch)} onUpdateSection={updateSection} onUpdateItem={updateSelectedItem} onRemove={() => removeElement(selectedElement.id)} t={t} /> : <EmptyState icon={<ChevronDown />} title={t("editor.noSelection")} text={t("editor.dragHint")} />}</div> : <div className="inspector-body"><div className="validation-list">{validationIssues.length === 0 && <div className="validation-item is-ready"><span className="validation-icon"><CheckCircle2 size={15} /></span><span><strong>{t("editor.validationReady")}</strong></span></div>}{blockingValidationIssues.map((issue) => <div className="validation-item is-error" key={`error-${issue}`}><span className="validation-icon"><TriangleAlert size={15} /></span><span><small>{t("editor.validationError")}</small><strong>{issue}</strong></span></div>)}{warningValidationIssues.map((issue) => <div className="validation-item" key={`warning-${issue}`}><span className="validation-icon"><TriangleAlert size={15} /></span><span><small>{t("editor.validationWarning")}</small><strong>{issue}</strong></span></div>)}{informationValidationIssues.map((issue) => <div className="validation-item is-info" key={`info-${issue}`}><span className="validation-icon"><CheckCircle2 size={15} /></span><span><small>{t("editor.validationInformation")}</small><strong>{issue}</strong></span></div>)}</div></div>}</aside>}
    </div>
    <Modal open={publishOpen} title={t("publish.title")} onClose={() => setPublishOpen(false)}><form onSubmit={handlePublish}><div className="modal-body"><p className="page-description">{t("publish.subtitle")}</p>{warningValidationIssues.length > 0 && <div className="publish-warning-list">{warningValidationIssues.map((issue) => <p key={issue}><TriangleAlert size={14} />{issue}</p>)}</div>}<div className="form-grid"><label className="field"><span>{t("publish.index")}</span><input required value={publishInput.index} onChange={(event) => setPublishInput((current) => ({ ...current, index: event.target.value }))} /></label><label className="field"><span>{t("publish.approver")}</span><input required value={publishInput.approvedBy} onChange={(event) => setPublishInput((current) => ({ ...current, approvedBy: event.target.value }))} /></label><label className="field span-two"><span>{t("publish.summary")}</span><textarea required value={publishInput.changeSummary} onChange={(event) => setPublishInput((current) => ({ ...current, changeSummary: event.target.value }))} /></label></div></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setPublishOpen(false)}>{t("common.cancel")}</Button><Button type="submit">{t("publish.confirm")}</Button></div></form></Modal>
  </div></DndContext>;
}

function ElementInspector({ element, plan, project, block, selectedData, onUpdateElement, onUpdateSection, onUpdateItem, onRemove, t }: {
  element: PlanElement;
  plan: Plan;
  project: Project;
  block?: BuildingBlock;
  selectedData: ReturnType<typeof findItem>;
  onUpdateElement: (patch: Partial<PlanElement>) => void;
  onUpdateSection: (sectionId: string, patch: Partial<PlanSection>) => void;
  onUpdateItem: (patch: Partial<PlanItem>) => void;
  onRemove: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const asset = (element.kind === "image" || element.kind === "pdf_page") ? project.assets.find((candidate) => candidate.id === element.assetId) : undefined;
  const section = element.kind === "section" ? plan.sections.find((candidate) => candidate.id === element.sectionId) : undefined;
  const elementTitle = element.kind === "block" && block && selectedData
    ? selectedData.item.customTitle?.[plan.documentLocale] ?? block.translations[plan.documentLocale].title
    : t(`editor.element.${element.kind}`);
  return <>
    <div className="inspector-block-head"><span className="stat-icon">{element.kind === "image" ? <Image size={18} /> : element.kind === "block" && block ? <BlockVisual visualKey={block.visualKey} color={block.color} size="small" /> : <FileOutput size={18} />}</span><div><h3>{elementTitle}</h3><span>{element.kind === "block" ? block?.code : t("editor.dragResize")}</span></div></div>
    {element.kind === "block" && block && selectedData && <>
      <p className="field-help">{t("editor.planOverrideHelp")}</p>
      <div className="inspector-section"><label>{t("editor.visibleTitle")}</label><input aria-label={t("editor.visibleTitle")} value={selectedData.item.customTitle?.[plan.documentLocale] ?? block.translations[plan.documentLocale].title} onChange={(event) => onUpdateItem({ customTitle: { ...selectedData.item.customTitle, [plan.documentLocale]: event.target.value } })} /></div>
      <div className="inspector-section"><label>{t("editor.visibleDescription")}</label><textarea aria-label={t("editor.visibleDescription")} value={selectedData.item.customShortDescription?.[plan.documentLocale] ?? block.translations[plan.documentLocale].shortDescription} onChange={(event) => onUpdateItem({ customShortDescription: { ...selectedData.item.customShortDescription, [plan.documentLocale]: event.target.value } })} /></div>
      <div className="inspector-section"><label>{t("editor.blockImageOverride")}</label><input aria-label={t("editor.blockImageOverride")} type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void readValidatedImageDataUrl(file).then((imageDataUrl) => onUpdateItem({ imageDataUrl })).catch(() => window.alert(t("editor.invalidBlockImage"))); }} />{selectedData.item.imageDataUrl && <Button variant="secondary" size="small" onClick={() => onUpdateItem({ imageDataUrl: undefined })}>{t("editor.useCatalogImage")}</Button>}</div>
      <div className="inspector-section"><label>{t("editor.expertNote")}</label><textarea aria-label={t("editor.expertNote")} value={selectedData.item.expertNote ?? ""} onChange={(event) => onUpdateItem({ expertNote: event.target.value })} /></div>
      <Link className="text-link" to="/catalog">{t("editor.editCatalogDefault")}</Link>
    </>}
    {element.kind === "section" && section && <div className="inspector-section"><label>{t("editor.sectionTitle")}</label><input aria-label={t("editor.sectionTitle")} value={section.titleOverrides?.[plan.documentLocale] ?? ""} placeholder={t("editor.defaultCategoryTitle")} onChange={(event) => onUpdateSection(section.id, { titleOverrides: { ...section.titleOverrides, [plan.documentLocale]: event.target.value } })} /></div>}
    {element.kind === "text" && <div className="inspector-section"><label>{t("editor.textContent")}</label><textarea aria-label={t("editor.textContent")} value={element.text[plan.documentLocale] ?? ""} onChange={(event) => onUpdateElement({ text: { ...element.text, [plan.documentLocale]: event.target.value } })} /></div>}
    {(element.kind === "image" || element.kind === "pdf_page") && <>
      <div className="inspector-section"><label>{t("editor.imageFit")}</label><select aria-label={t("editor.imageFit")} value={element.fitMode ?? "contain"} onChange={(event) => onUpdateElement({ fitMode: event.target.value as "contain" | "cover" })}><option value="contain">{t("editor.contain")}</option><option value="cover">{t("editor.cover")}</option></select></div>
      {element.fitMode === "cover" && <><div className="inspector-section"><label>{t("editor.cropHorizontal")}</label><input aria-label={t("editor.cropHorizontal")} type="range" min="0" max="100" value={element.crop?.x ?? 50} onChange={(event) => onUpdateElement({ crop: { x: Number(event.target.value), y: element.crop?.y ?? 50, width: 100, height: 100 } })} /></div><div className="inspector-section"><label>{t("editor.cropVertical")}</label><input aria-label={t("editor.cropVertical")} type="range" min="0" max="100" value={element.crop?.y ?? 50} onChange={(event) => onUpdateElement({ crop: { x: element.crop?.x ?? 50, y: Number(event.target.value), width: 100, height: 100 } })} /></div></>}
      {element.kind === "pdf_page" && <div className="inspector-section"><label>{t("editor.pageNumber")}</label><input aria-label={t("editor.pageNumber")} type="number" min="1" max={asset?.pageCount ?? 1} value={element.pageNumber ?? 1} onChange={(event) => onUpdateElement({ pageNumber: Math.max(1, Math.min(asset?.pageCount ?? 1, Number(event.target.value))) })} /><small>{t("editor.pageCount", { count: asset?.pageCount ?? 1 })}</small></div>}
    </>}
    {element.kind === "document" && <div className="inspector-section"><label>{t("editor.displayVariant")}</label><select aria-label={t("editor.displayVariant")} value={element.displayVariant ?? "compact"} onChange={(event) => onUpdateElement({ displayVariant: event.target.value as typeof element.displayVariant })}><option value="compact">{t("editor.variantCompact")}</option><option value="emergency_card">{t("editor.variantEmergency")}</option><option value="participant_list">{t("editor.variantParticipants")}</option><option value="qr_link">{t("editor.variantQr")}</option></select></div>}
    <div className="inspector-actions"><Button variant="secondary" size="small" onClick={() => onUpdateElement({ locked: !element.locked })}>{element.locked ? <Unlock size={14} /> : <Lock size={14} />}{element.locked ? t("editor.unlock") : t("editor.lock")}</Button>{element.kind !== "title_block" && <Button variant="danger" size="small" onClick={onRemove}><Trash2 size={14} />{t("editor.remove")}</Button>}</div>
  </>;
}

function categoryPath(categories: BuildingBlockCategory[], categoryId: string, locale: "de" | "en"): string {
  const names: string[] = []; const visited = new Set<string>(); let current = categories.find((category) => category.id === categoryId);
  while (current && !visited.has(current.id)) { visited.add(current.id); names.unshift(current.translations[locale].name); current = current.parentId ? categories.find((category) => category.id === current?.parentId) : undefined; }
  return names.join(" / ");
}

function CategoryLibrary({ categories, blocks, expanded, locale, usageCounts, onToggle, onAdd, t, parentId, depth = 0 }: { categories: BuildingBlockCategory[]; blocks: ReturnType<typeof useApp>["database"]["blocks"]; expanded: Set<string>; locale: "de" | "en"; usageCounts: Map<string, number>; onToggle: (id: string) => void; onAdd: (id: string) => void; t: (key: string) => string; parentId?: string; depth?: number }) {
  return <>{categories.filter((category) => category.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder).map((category) => { const children = categories.some((candidate) => candidate.parentId === category.id); const categoryBlocks = blocks.filter((block) => block.categoryIds.includes(category.id)); const open = expanded.has(category.id); if (!categoryBlocks.length && !children) return null; return <div className="library-category" key={category.id}><button className="library-category-header" style={{ paddingLeft: 12 + depth * 12 }} onClick={() => onToggle(category.id)}><span style={{ backgroundColor: category.color }} />{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{category.translations[locale].name}</strong><small>{categoryBlocks.length}</small></button>{open && <><div className="library-category-blocks">{categoryBlocks.map((block) => <DraggableLibraryItem key={`${category.id}-${block.id}`} id={`block:${block.id}`} title={block.translations[locale].title} subtitle={`${block.code} · ${categoryPath(categories, block.primaryCategoryId, locale)} · ${usageCounts.get(block.id) ?? 0}×`} icon={<BlockVisual visualKey={block.visualKey} color={block.color} size="small" />} added={Boolean(usageCounts.get(block.id))} onAdd={() => onAdd(block.id)} addLabel={t("common.add")} />)}</div><CategoryLibrary categories={categories} blocks={blocks} expanded={expanded} locale={locale} usageCounts={usageCounts} onToggle={onToggle} onAdd={onAdd} t={t} parentId={category.id} depth={depth + 1} /></>}</div>; })}</>;
}

function LibraryGroup({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) { const [open, setOpen] = useState(defaultOpen); return <div className="library-group"><button className="library-category-header" onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{title}</strong></button>{open && <div className="library-category-blocks">{children}</div>}</div>; }

function DraggableLibraryItem({ id, title, subtitle, icon, onAdd, addLabel }: { id: string; title: string; subtitle: string; icon: React.ReactNode; added?: boolean; onAdd: () => void; addLabel: string }) { const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id }); return <article ref={setNodeRef} {...attributes} {...listeners} className={`editor-catalog-card ${isDragging ? "is-dragging" : ""}`} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}><span className="library-drag-icon">{icon}</span><div><strong>{title}</strong><span>{subtitle}</span></div><button className="icon-button" aria-label={`${addLabel}: ${title}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAdd(); }}><Plus size={15} /></button></article>; }

const PlanCanvas = function PlanCanvas({ ref, plan, project, zoom, blockMap, categoryMap, selectedIds, setElementRef, onSelect, t }: { ref: React.Ref<HTMLDivElement>; plan: Plan; project: NonNullable<ReturnType<typeof useApp>["database"]["projects"][number]>; zoom: number; blockMap: Map<string, ReturnType<typeof useApp>["database"]["blocks"][number]>; categoryMap: Map<string, BuildingBlockCategory>; selectedIds: string[]; setElementRef: (id: string, element: HTMLElement | null) => void; onSelect: (element: PlanElement) => void; t: (key: string) => string }) { const { setNodeRef } = useDroppable({ id: "plan-canvas" }); const combinedRef = (node: HTMLDivElement | null) => { setNodeRef(node); if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }; return <div ref={combinedRef} className="wysiwyg-page" style={{ transform: `scale(${zoom})` }}><header className="plan-header"><div><span className="plan-header-brand">QUICKSiGe</span><h2>{plan.title}</h2></div><div className="plan-header-meta"><strong>{project.name}</strong><span>{project.projectNumber} · {project.address}, {project.city}</span><span>{plan.status === "published" ? t("status.published") : translate(plan.documentLocale, "editor.workingDraft")}</span></div></header>{plan.layout.elements.filter((element) => !element.hidden).map((element) => <PlanElementView key={element.id} element={element} plan={plan} project={project} blockMap={blockMap} categoryMap={categoryMap} selected={selectedIds.includes(element.id)} setRef={(node) => setElementRef(element.id, node)} onSelect={() => onSelect(element)} t={t} />)}</div>; };

function PlanElementView({ element, plan, project, blockMap, categoryMap, selected, setRef, onSelect, t }: { element: PlanElement; plan: Plan; project: ReturnType<typeof useApp>["database"]["projects"][number]; blockMap: Map<string, ReturnType<typeof useApp>["database"]["blocks"][number]>; categoryMap: Map<string, BuildingBlockCategory>; selected: boolean; setRef: (node: HTMLElement | null) => void; onSelect: () => void; t: (key: string) => string }) {
  const style: React.CSSProperties = { left: element.x * CSS_PIXELS_PER_LAYOUT_UNIT, top: element.y * CSS_PIXELS_PER_LAYOUT_UNIT, width: element.width * CSS_PIXELS_PER_LAYOUT_UNIT, height: element.height * CSS_PIXELS_PER_LAYOUT_UNIT, zIndex: element.zIndex };
  if (element.kind === "section") { const section = plan.sections.find((candidate) => candidate.id === element.sectionId); const category = section && categoryMap.get(section.categoryId); if (!section || !category) return null; return <section ref={setRef} data-element-id={element.id} className={`canvas-element canvas-section ${selected ? "is-selected" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}><div style={{ backgroundColor: category.color }}>{section.titleOverrides?.[plan.documentLocale] ?? category.translations[plan.documentLocale].name}</div></section>; }
  if (element.kind === "block") { const section = plan.sections.find((candidate) => candidate.id === element.sectionId); const item = section?.items.find((candidate) => candidate.id === element.itemId); const block = item && blockMap.get(item.blockId); if (!item || !block) return null; const content = block.translations[plan.documentLocale]; const imageDataUrl = item.imageDataUrl ?? block.imageDataUrl; return <button ref={setRef as React.Ref<HTMLButtonElement>} data-element-id={element.id} aria-pressed={selected} className={`canvas-element canvas-block ${selected ? "is-selected" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}><span className="canvas-block-title" style={{ backgroundColor: block.color }}>{item.customTitle?.[plan.documentLocale] ?? content.title}</span><span className="canvas-block-content">{imageDataUrl ? <img className="canvas-block-image" src={imageDataUrl} alt="" /> : <BlockVisual visualKey={block.visualKey} color={block.color} size="small" />}<span>{item.customShortDescription?.[plan.documentLocale] ?? content.shortDescription}</span></span><span className="canvas-block-references">{block.regulations.join(" · ")}</span></button>; }
  if (element.kind === "image" || element.kind === "pdf_page") { const asset = project.assets.find((candidate) => candidate.id === element.assetId); if (!asset) return null; return <div ref={setRef} data-element-id={element.id} className={`canvas-element canvas-asset ${selected ? "is-selected" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}><CanvasAssetImage asset={asset} pdfPage={element.kind === "pdf_page"} pageNumber={element.pageNumber} fitMode={element.fitMode} crop={element.crop} t={t} /></div>; }
  if (element.kind === "document") {
    const variant = element.displayVariant ?? "compact";
    return <div ref={setRef} data-element-id={element.id} className={`canvas-element canvas-document variant-${variant} ${selected ? "is-selected" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}><FileOutput size={22} /><strong>{t(`documents.${element.documentType}`)}</strong>{variant === "emergency_card" && <span>{project.emergencyContacts.slice(0, 3).map((contact) => `${contact.label}: ${contact.phone}`).join(" · ") || "—"}</span>}{variant === "participant_list" && <span>{project.participants.slice(0, 4).map((participant) => `${participant.name} · ${participant.company}`).join(" · ") || "—"}</span>}{variant === "qr_link" && <span className="qr-placeholder" aria-label={t("editor.qrPlaceholder")}>QR</span>}</div>;
  }
  if (element.kind === "title_block") return <div className="canvas-element canvas-title-block" style={style}><strong>{project.name}</strong><span>{project.participants.find((participant) => participant.role === "coordinator")?.name ?? "—"}</span><span>{project.projectNumber} · A0</span></div>;
  if (element.kind === "text") return <div ref={setRef} data-element-id={element.id} className={`canvas-element canvas-text ${selected ? "is-selected" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}>{element.text[plan.documentLocale] ?? ""}</div>;
  return null;
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
