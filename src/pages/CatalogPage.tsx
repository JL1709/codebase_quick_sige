import { DndContext, PointerSensor, closestCenter, type DragEndEvent, type DragOverEvent, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, FolderPlus, GripVertical, ImagePlus, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BlockVisual } from "../components/BlockVisual";
import { Button, Modal, PageHeader } from "../components/Ui";
import {
  blockHierarchyColor,
  categoryDescendantIds,
  categoryHierarchyColor,
  categoryPath,
  categoryPlacementIds,
  categoryTrail,
  reorderCategoryIds,
} from "../domain/categoryTree";
import { readableTextColor } from "../domain/colorContrast";
import type { BuildingBlock, BuildingBlockCategory, Locale } from "../domain/types";
import { readValidatedImageDataUrl } from "../domain/projectAssets";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";

const defaultContent = { title: "", shortDescription: "", longDescription: "", searchTerms: [] as string[] };
type CategoryDropEdge = "before" | "after";
type CategoryDropIndicator = { targetCategoryId: string; edge: CategoryDropEdge };

function categoryDropTarget(over: DragOverEvent["over"]): CategoryDropIndicator | null {
  const targetCategoryId = over?.data.current?.categoryId;
  const edge = over?.data.current?.edge;
  return typeof targetCategoryId === "string" && (edge === "before" || edge === "after")
    ? { targetCategoryId, edge }
    : null;
}

function nextCategorySortOrder(parentId: string | undefined, categories: BuildingBlockCategory[], excludedCategoryId?: string): number {
  const siblingOrders = categories
    .filter((category) => category.parentId === parentId && category.id !== excludedCategoryId)
    .map((category) => category.sortOrder);
  return siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
}

export function CatalogPage() {
  const { database, saveBlock, archiveBlock, restoreBlock, saveCategory, reorderCategories, archiveCategory, restoreCategory } = useApp();
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set(database.categories.filter((category) => !category.parentId).map((category) => category.id)));
  const [blockOpen, setBlockOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<BuildingBlock | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BuildingBlockCategory | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [categoryDropIndicator, setCategoryDropIndicator] = useState<CategoryDropIndicator | null>(null);
  const categorySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const categories = database.categories.filter((category) => showArchived || category.lifecycle === "active").sort((a, b) => a.sortOrder - b.sortOrder);

  const descendantIds = useMemo(() => {
    if (categoryId === "all") return null;
    return categoryDescendantIds(categoryId, categories);
  }, [categories, categoryId]);
  const blocks = database.blocks.filter((block) => {
    if (!showArchived && block.lifecycle !== "active") return false;
    const content = block.translations[locale] ?? block.translations.de;
    const searchable = `${content.title} ${content.shortDescription} ${content.longDescription} ${content.searchTerms.join(" ")} ${block.regulations.join(" ")}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (!descendantIds || block.categoryIds.some((id) => descendantIds.has(id)));
  });

  const openBlock = (block?: BuildingBlock) => { setEditingBlock(block ?? null); setBlockOpen(true); };
  const openCategory = (category?: BuildingBlockCategory) => { setEditingCategory(category ?? null); setCategoryOpen(true); };
  const handleCategoryDragOver = ({ active, over }: DragOverEvent) => {
    const dropTarget = categoryDropTarget(over);
    if (!dropTarget || active.id === dropTarget.targetCategoryId) {
      setCategoryDropIndicator(null);
      return;
    }
    const draggedCategory = categories.find((category) => category.id === active.id);
    const targetCategory = categories.find((category) => category.id === dropTarget.targetCategoryId);
    if (!draggedCategory || !targetCategory || draggedCategory.parentId !== targetCategory.parentId) {
      setCategoryDropIndicator(null);
      return;
    }
    setCategoryDropIndicator(dropTarget);
  };
  const handleCategoryDragEnd = ({ active, over }: DragEndEvent) => {
    setCategoryDropIndicator(null);
    const dropTarget = categoryDropTarget(over);
    if (!dropTarget || active.id === dropTarget.targetCategoryId) return;
    const draggedCategory = categories.find((category) => category.id === active.id);
    const targetCategory = categories.find((category) => category.id === dropTarget.targetCategoryId);
    if (!draggedCategory || !targetCategory || draggedCategory.parentId !== targetCategory.parentId) return;
    const siblingIds = categories
      .filter((category) => category.parentId === draggedCategory.parentId)
      .sort((first, second) => first.sortOrder - second.sortOrder)
      .map((category) => category.id);
    reorderCategories(
      draggedCategory.parentId,
      reorderCategoryIds(siblingIds, draggedCategory.id, targetCategory.id, dropTarget.edge),
    );
  };
  return <div className="page">
    <PageHeader eyebrow={t("catalog.eyebrow")} title={t("catalog.title")} description={t("catalog.subtitle")} action={<div className="page-actions"><Button variant="secondary" onClick={() => setShowArchived((value) => !value)}><ArchiveRestore size={15} />{t("catalog.showArchived")}</Button><Button variant="secondary" onClick={() => openCategory()}><FolderPlus size={15} />{t("catalog.addCategory")}</Button><Button onClick={() => openBlock()}><Plus size={15} />{t("catalog.addBlock")}</Button></div>} />
    <div className="catalog-layout">
      <aside className="panel category-browser"><div className="category-browser-header"><strong>{t("catalog.categories")}</strong></div><button className={`category-tree-row root ${categoryId === "all" ? "is-selected" : ""}`} onClick={() => setCategoryId("all")}>{t("catalog.allCategories")}</button><DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragStart={() => setCategoryDropIndicator(null)} onDragOver={handleCategoryDragOver} onDragCancel={() => setCategoryDropIndicator(null)} onDragEnd={handleCategoryDragEnd}><CategoryTree categories={categories} locale={locale} selectedId={categoryId} expanded={expanded} dropIndicator={categoryDropIndicator} onSelect={setCategoryId} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onEdit={openCategory} t={t} /></DndContext></aside>
      <main><div className="catalog-toolbar"><div className="search-shell"><Search size={17} /><input aria-label={t("catalog.search")} className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("catalog.search")} /></div><span className="catalog-result-count">{t("catalog.resultCount", { count: blocks.length })}</span></div>
        <div className="catalog-grid">{blocks.map((block) => <CatalogBlockCard key={block.id} block={block} categories={categories} locale={locale} onEdit={() => openBlock(block)} t={t} />)}</div>
      </main>
    </div>
    <BlockEditorModal key={`block-${editingBlock?.id ?? "new"}-${blockOpen}`} open={blockOpen} block={editingBlock} categories={database.categories.filter((category) => category.lifecycle === "active")} locale={locale} onClose={() => setBlockOpen(false)} onSave={(block) => { saveBlock(block); setBlockOpen(false); }} onArchive={editingBlock && editingBlock.lifecycle === "active" ? () => { archiveBlock(editingBlock.id); setBlockOpen(false); } : undefined} onRestore={editingBlock && editingBlock.lifecycle === "archived" ? () => { restoreBlock(editingBlock.id); setBlockOpen(false); } : undefined} t={t} />
    <CategoryEditorModal key={`category-${editingCategory?.id ?? "new"}-${categoryOpen}`} open={categoryOpen} category={editingCategory} categories={database.categories} locale={locale} onClose={() => setCategoryOpen(false)} onSave={(category) => { saveCategory(category); setCategoryOpen(false); }} onArchive={editingCategory && editingCategory.lifecycle === "active" ? () => { archiveCategory(editingCategory.id); setCategoryOpen(false); } : undefined} onRestore={editingCategory && editingCategory.lifecycle === "archived" ? () => { restoreCategory(editingCategory.id); setCategoryOpen(false); } : undefined} t={t} />
  </div>;
}

function CatalogBlockCard({ block, categories, locale, onEdit, t }: { block: BuildingBlock; categories: BuildingBlockCategory[]; locale: Locale; onEdit: () => void; t: (key: string) => string }) {
  const content = block.translations[locale] ?? block.translations.de;
  const trail = categoryTrail(block.primaryCategoryId, categories);
  const blockColor = blockHierarchyColor(block, categories);
  return <article className={`catalog-card ${block.lifecycle === "archived" ? "is-archived" : ""}`}>
    <section className="catalog-block-preview" aria-label={content.title}>
      <h3 style={{ backgroundColor: blockColor, color: readableTextColor(blockColor) }}>{content.title}</h3>
      <div className="catalog-block-preview-content">
        <span className="catalog-block-preview-image">{block.imageDataUrl ? <img src={block.imageDataUrl} alt="" /> : <BlockVisual visualKey={block.visualKey} color={blockColor} size="large" />}</span>
        <p>{content.shortDescription}</p>
      </div>
      <p className="catalog-block-preview-references">{block.regulations.length ? block.regulations.join(" · ") : t("catalog.noReferences")}</p>
    </section>
    <footer className="catalog-card-footer">
      <div className="catalog-card-metadata">
        <ol className="catalog-category-trail" aria-label={t("catalog.categoryHierarchy")}>
          {trail.map((category, index) => <li key={category.id}>{index > 0 && <ChevronRight aria-hidden="true" size={12} />}<span className="catalog-category-level"><i style={{ backgroundColor: categoryHierarchyColor(category.id, categories) }} />{category.translations[locale]?.name ?? category.id}</span></li>)}
        </ol>
      </div>
      <button type="button" className="icon-button catalog-card-edit" onClick={onEdit} aria-label={`${t("common.edit")}: ${content.title}`}><Pencil size={15} /></button>
    </footer>
  </article>;
}

function CategoryTree({ categories, locale, selectedId, expanded, dropIndicator, onSelect, onToggle, onEdit, t, parentId, depth = 0 }: { categories: BuildingBlockCategory[]; locale: Locale; selectedId: string; expanded: Set<string>; dropIndicator: CategoryDropIndicator | null; onSelect: (id: string) => void; onToggle: (id: string) => void; onEdit: (category: BuildingBlockCategory) => void; t: (key: string) => string; parentId?: string; depth?: number }) {
  return <>{categories.filter((category) => category.parentId === parentId).map((category) => {
    const hasChildren = categories.some((candidate) => candidate.parentId === category.id);
    const isExpanded = expanded.has(category.id);
    const categoryName = category.translations[locale].name;
    return <div key={category.id}>
      <DraggableCategoryRow category={category} categoryName={categoryName} categories={categories} depth={depth} selected={selectedId === category.id} expanded={isExpanded} hasChildren={hasChildren} dropEdge={dropIndicator?.targetCategoryId === category.id ? dropIndicator.edge : undefined} onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} t={t} />
      {hasChildren && isExpanded && <CategoryTree categories={categories} locale={locale} selectedId={selectedId} expanded={expanded} dropIndicator={dropIndicator} onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} t={t} parentId={category.id} depth={depth + 1} />}
    </div>;
  })}</>;
}

function DraggableCategoryRow({ category, categoryName, categories, depth, selected, expanded, hasChildren, dropEdge, onSelect, onToggle, onEdit, t }: { category: BuildingBlockCategory; categoryName: string; categories: BuildingBlockCategory[]; depth: number; selected: boolean; expanded: boolean; hasChildren: boolean; dropEdge?: CategoryDropEdge; onSelect: (id: string) => void; onToggle: (id: string) => void; onEdit: (category: BuildingBlockCategory) => void; t: (key: string) => string }) {
  const draggable = useDraggable({ id: category.id });
  const beforeDropZone = useDroppable({ id: `${category.id}:before`, data: { categoryId: category.id, edge: "before" satisfies CategoryDropEdge } });
  const afterDropZone = useDroppable({ id: `${category.id}:after`, data: { categoryId: category.id, edge: "after" satisfies CategoryDropEdge } });
  return <div
    ref={draggable.setNodeRef}
    data-category-id={category.id}
    data-parent-id={category.parentId ?? "root"}
    className={`category-tree-row ${selected ? "is-selected" : ""} ${draggable.isDragging ? "is-dragging" : ""} ${dropEdge ? `is-drop-${dropEdge}` : ""}`}
    style={{ paddingLeft: 8 + depth * 18, transform: CSS.Translate.toString(draggable.transform) }}
  >
    <span ref={beforeDropZone.setNodeRef} className="category-drop-zone is-before" aria-hidden="true" />
    <span ref={afterDropZone.setNodeRef} className="category-drop-zone is-after" aria-hidden="true" />
    <button type="button" className="category-drag-handle" ref={draggable.setActivatorNodeRef} {...draggable.attributes} {...draggable.listeners} aria-label={`${t("catalog.reorderCategory")}: ${categoryName}`}><GripVertical size={13} /></button>
    <button type="button" className="category-expand" onClick={() => hasChildren && onToggle(category.id)} aria-label={categoryName} disabled={!hasChildren}>{hasChildren ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}</button>
    <button type="button" className="category-name" onClick={() => onSelect(category.id)}><span style={{ backgroundColor: categoryHierarchyColor(category.id, categories) }} />{categoryName}</button>
    <button type="button" className="icon-button" onClick={() => onEdit(category)} aria-label={`${t("common.edit")}: ${categoryName}`}><Pencil size={12} /></button>
  </div>;
}

function BlockEditorModal({ open, block, categories, locale, onClose, onSave, onArchive, onRestore, t }: { open: boolean; block: BuildingBlock | null; categories: BuildingBlockCategory[]; locale: Locale; onClose: () => void; onSave: (block: BuildingBlock) => void; onArchive?: () => void; onRestore?: () => void; t: (key: string) => string }) {
  const initialCategoryId = categories[0]?.id ?? "";
  const [draft, setDraft] = useState<BuildingBlock>(() => block ? structuredClone(block) : {
    id: newId("block"),
    primaryCategoryId: initialCategoryId,
    categoryIds: initialCategoryId ? categoryPlacementIds(initialCategoryId, categories) : [],
    visualKey: "safety",
    color: initialCategoryId ? categoryHierarchyColor(initialCategoryId, categories) : "#496f5f",
    regulations: [],
    lifecycle: "active",
    translations: { de: { ...defaultContent }, en: { ...defaultContent } },
  });
  const updateTranslation = (key: "title" | "shortDescription" | "longDescription" | "searchTerms", value: string | string[]) => setDraft((current) => ({
    ...current,
    translations: {
      ...current.translations,
      [locale]: { ...current.translations[locale], [key]: value },
    },
  }));
  const selectCategory = (categoryId: string) => setDraft((current) => ({
    ...current,
    primaryCategoryId: categoryId,
    categoryIds: categoryPlacementIds(categoryId, categories),
    color: categoryHierarchyColor(categoryId, categories),
  }));
  const updateImage = (file?: File) => {
    if (!file) return;
    void readValidatedImageDataUrl(file)
      .then((imageDataUrl) => setDraft((current) => ({ ...current, imageDataUrl })))
      .catch(() => window.alert(t("catalog.invalidImage")));
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.primaryCategoryId) return;
    onSave({
      ...draft,
      categoryIds: categoryPlacementIds(draft.primaryCategoryId, categories),
      color: categoryHierarchyColor(draft.primaryCategoryId, categories),
    });
  };
  const content = draft.translations[locale];
  return <Modal open={open} title={block ? t("catalog.editBlock") : t("catalog.addBlock")} onClose={onClose}><form onSubmit={handleSubmit}>
    <div className="modal-body block-form">
      <div className="block-language-fields">
        <label className="field"><span>{t("catalog.blockTitle")}</span><input required value={content.title} onChange={(event) => updateTranslation("title", event.target.value)} /></label>
        <BlockImageEditor imageDataUrl={draft.imageDataUrl} imageAlt={content.title} onImageSelected={updateImage} onRemove={() => setDraft((current) => ({ ...current, imageDataUrl: undefined }))} t={t} />
        <label className="field"><span>{t("catalog.shortDescription")}</span><textarea required value={content.shortDescription} onChange={(event) => updateTranslation("shortDescription", event.target.value)} /></label>
        <label className="field"><span>{t("catalog.longDescription")}</span><textarea value={content.longDescription} onChange={(event) => updateTranslation("longDescription", event.target.value)} /></label>
      </div>
      <section className="block-placement-section" aria-labelledby="block-placement-title">
        <div className="block-form-section-heading"><h3 id="block-placement-title">{t("catalog.placement")}</h3><p>{t("catalog.placementHelp")}</p></div>
        <CategoryPlacementTree categories={categories} locale={locale} selectedId={draft.primaryCategoryId} label={t("catalog.placement")} onSelect={selectCategory} />
      </section>
      <label className="field"><span>{t("catalog.references")}</span><input value={draft.regulations.join(", ")} onChange={(event) => setDraft({ ...draft, regulations: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
      <label className="field"><span>{t("catalog.searchTerms")}</span><input value={content.searchTerms.join(", ")} onChange={(event) => updateTranslation("searchTerms", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} /></label>
    </div>
    <div className="modal-footer">{onArchive && <Button type="button" variant="danger" onClick={onArchive}><Archive size={14} />{t("common.archive")}</Button>}{onRestore && <Button type="button" variant="secondary" onClick={onRestore}><ArchiveRestore size={14} />{t("common.restore")}</Button>}<Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div>
  </form></Modal>;
}

function BlockImageEditor({ imageDataUrl, imageAlt, onImageSelected, onRemove, t }: { imageDataUrl?: string; imageAlt: string; onImageSelected: (file?: File) => void; onRemove: () => void; t: (key: string) => string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const openFilePicker = () => inputRef.current?.click();
  const acceptDroppedImage = (file?: File) => {
    setIsDragging(false);
    onImageSelected(file);
  };

  return <section className="block-image-editor" aria-labelledby="block-image-editor-title">
    <div className="block-image-editor-heading">
      <span id="block-image-editor-title">{t("catalog.image")}</span>
      <small>{t("catalog.imageHelp")}</small>
    </div>
    <div
      className={`block-image-dropzone ${imageDataUrl ? "has-image" : "is-empty"} ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
      onDrop={(event) => { event.preventDefault(); acceptDroppedImage(event.dataTransfer.files[0]); }}
    >
      {imageDataUrl
        ? <img src={imageDataUrl} alt={imageAlt} />
        : <div className="block-image-empty"><ImagePlus size={32} /><strong>{t("catalog.addImage")}</strong><span>{t("catalog.imageDropHint")}</span></div>}
    </div>
    <div className="block-image-actions">
      <Button type="button" size="small" variant="secondary" onClick={openFilePicker}><Upload size={14} />{imageDataUrl ? t("catalog.replaceImage") : t("catalog.addImage")}</Button>
      {imageDataUrl && <Button type="button" size="small" variant="secondary" onClick={onRemove}><Trash2 size={14} />{t("common.remove")}</Button>}
    </div>
    <input
      ref={inputRef}
      className="block-image-file-input"
      type="file"
      accept="image/png,image/jpeg"
      aria-label={t("catalog.imageUpload")}
      onChange={(event) => { onImageSelected(event.target.files?.[0]); event.target.value = ""; }}
    />
  </section>;
}

function CategoryPlacementTree({ categories, locale, selectedId, label, onSelect }: { categories: BuildingBlockCategory[]; locale: Locale; selectedId: string; label: string; onSelect: (categoryId: string) => void }) {
  const selectedIds = useMemo(() => new Set(categoryPlacementIds(selectedId, categories)), [categories, selectedId]);
  const [expanded, setExpanded] = useState(() => new Set(categoryPlacementIds(selectedId, categories)));
  useEffect(() => {
    setExpanded(new Set(categoryPlacementIds(selectedId, categories)));
  }, [categories, selectedId]);
  const toggle = (categoryId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
    return next;
  });
  return <div className="category-placement-tree" role="tree" aria-label={label}>
    <CategoryPlacementNodes categories={categories} locale={locale} selectedId={selectedId} selectedIds={selectedIds} expanded={expanded} onSelect={onSelect} onToggle={toggle} />
  </div>;
}

function CategoryPlacementNodes({ categories, locale, selectedId, selectedIds, expanded, onSelect, onToggle, parentId, depth = 0 }: { categories: BuildingBlockCategory[]; locale: Locale; selectedId: string; selectedIds: Set<string>; expanded: Set<string>; onSelect: (categoryId: string) => void; onToggle: (categoryId: string) => void; parentId?: string; depth?: number }) {
  return <>{categories.filter((category) => category.parentId === parentId).sort((first, second) => first.sortOrder - second.sortOrder).map((category) => {
    const categoryName = category.translations[locale]?.name ?? category.id;
    const hasChildren = categories.some((candidate) => candidate.parentId === category.id);
    const isExpanded = expanded.has(category.id);
    const isInSelectedPath = selectedIds.has(category.id);
    return <div key={category.id} role="treeitem" data-category-id={category.id} aria-level={depth + 1} aria-selected={isInSelectedPath} aria-current={selectedId === category.id ? "true" : undefined} aria-expanded={hasChildren ? isExpanded : undefined}>
      <div className={`category-placement-row ${isInSelectedPath ? "is-selected" : ""} ${selectedId === category.id ? "is-current" : ""}`} style={{ paddingLeft: 10 + depth * 20 }}>
        <button type="button" className="category-expand" disabled={!hasChildren} aria-label={categoryName} onClick={() => hasChildren && onToggle(category.id)}>{hasChildren ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}</button>
        <label><input type="checkbox" checked={isInSelectedPath} onChange={() => onSelect(category.id)} /><i style={{ backgroundColor: categoryHierarchyColor(category.id, categories) }} /><span>{categoryName}</span></label>
      </div>
      {hasChildren && isExpanded && <CategoryPlacementNodes categories={categories} locale={locale} selectedId={selectedId} selectedIds={selectedIds} expanded={expanded} onSelect={onSelect} onToggle={onToggle} parentId={category.id} depth={depth + 1} />}
    </div>;
  })}</>;
}

function CategoryEditorModal({ open, category, categories, locale: uiLocale, onClose, onSave, onArchive, onRestore, t }: { open: boolean; category: BuildingBlockCategory | null; categories: BuildingBlockCategory[]; locale: Locale; onClose: () => void; onSave: (category: BuildingBlockCategory) => void; onArchive?: () => void; onRestore?: () => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState<BuildingBlockCategory>(() => category ? structuredClone(category) : ({
    id: newId("category"),
    color: "#496f5f",
    sortOrder: nextCategorySortOrder(undefined, categories),
    lifecycle: "active",
    translations: { de: { name: "", description: "" }, en: { name: "", description: "" } },
  }));
  const unavailableParentIds = category ? categoryDescendantIds(category.id, categories) : new Set<string>();
  const updateParent = (parentId: string | undefined) => setDraft((current) => ({
    ...current,
    parentId,
    sortOrder: current.parentId === parentId ? current.sortOrder : nextCategorySortOrder(parentId, categories, current.id),
  }));
  const updateName = (name: string) => setDraft((current) => ({
    ...current,
    translations: {
      ...current.translations,
      [uiLocale]: { ...current.translations[uiLocale], name },
    },
  }));
  return <Modal open={open} title={category ? t("catalog.editCategory") : t("catalog.addCategory")} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <div className="modal-body form-grid">
        <label className="field"><span>{t("catalog.parentCategory")}</span><select value={draft.parentId ?? ""} onChange={(event) => updateParent(event.target.value || undefined)}><option value="">—</option>{categories.filter((candidate) => candidate.lifecycle === "active" && !unavailableParentIds.has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{categoryPath(candidate.id, categories, uiLocale)}</option>)}</select></label>
        <label className="field"><span>{t("catalog.color")}</span><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
        <label className="field span-two"><span>{t("catalog.categoryName")}</span><input required value={draft.translations[uiLocale].name} onChange={(event) => updateName(event.target.value)} /></label>
      </div>
      <div className="modal-footer">{onArchive && <Button type="button" variant="danger" onClick={onArchive}>{t("common.archive")}</Button>}{onRestore && <Button type="button" variant="secondary" onClick={onRestore}>{t("common.restore")}</Button>}<Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div>
    </form>
  </Modal>;
}
