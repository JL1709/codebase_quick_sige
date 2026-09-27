import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Download, EllipsisVertical, FolderPlus, Pencil, Plus, Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BlockVisual } from "../components/BlockVisual";
import { Button, Modal, PageHeader } from "../components/Ui";
import { categoryDescendantIds, categoryPath } from "../domain/categoryTree";
import type { BuildingBlock, BuildingBlockCategory, Locale } from "../domain/types";
import { readValidatedImageDataUrl } from "../domain/projectAssets";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";

const defaultContent = { title: "", shortDescription: "", longDescription: "", searchTerms: [] as string[] };

export function CatalogPage() {
  const { database, saveBlock, duplicateBlock, archiveBlock, restoreBlock, saveCategory, archiveCategory, restoreCategory } = useApp();
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set(database.categories.filter((category) => !category.parentId).map((category) => category.id)));
  const [blockOpen, setBlockOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<BuildingBlock | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BuildingBlockCategory | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const categories = database.categories.filter((category) => showArchived || category.lifecycle === "active").sort((a, b) => a.sortOrder - b.sortOrder);

  const descendantIds = useMemo(() => {
    if (categoryId === "all") return null;
    return categoryDescendantIds(categoryId, categories);
  }, [categories, categoryId]);
  const blocks = database.blocks.filter((block) => {
    if (!showArchived && block.lifecycle !== "active") return false;
    const content = block.translations[locale] ?? block.translations.de;
    const searchable = `${content.title} ${content.shortDescription} ${content.longDescription} ${content.searchTerms.join(" ")} ${block.code} ${block.tags.join(" ")} ${block.regulations.join(" ")}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (!descendantIds || block.categoryIds.some((id) => descendantIds.has(id)));
  });

  const openBlock = (block?: BuildingBlock) => { setEditingBlock(block ?? null); setBlockOpen(true); };
  const openCategory = (category?: BuildingBlockCategory) => { setEditingCategory(category ?? null); setCategoryOpen(true); };
  const exportContentReview = () => {
    const rows = [["code", "language", "title", "provenance", "source", "reviewed_at", "regulations"]];
    database.blocks.forEach((block) => (["de", "en"] as Locale[]).forEach((language) => rows.push([
      block.code, language, block.translations[language].title, block.provenance.kind,
      block.provenance.sourceReference ?? block.provenance.label, block.provenance.verifiedAt ?? block.reviewedAt ?? "",
      block.regulations.join(" | "),
    ])));
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "quicksige-content-review.csv"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return <div className="page">
    <PageHeader eyebrow={t("catalog.eyebrow")} title={t("catalog.title")} description={t("catalog.subtitle")} action={<div className="page-actions"><Button variant="secondary" onClick={exportContentReview}><Download size={15} />{t("catalog.reviewExport")}</Button><Button variant="secondary" onClick={() => setShowArchived((value) => !value)}><ArchiveRestore size={15} />{t("catalog.showArchived")}</Button><Button variant="secondary" onClick={() => openCategory()}><FolderPlus size={15} />{t("catalog.addCategory")}</Button><Button onClick={() => openBlock()}><Plus size={15} />{t("catalog.addBlock")}</Button></div>} />
    <div className="catalog-layout">
      <aside className="panel category-browser"><div className="category-browser-header"><strong>{t("catalog.categories")}</strong></div><button className={`category-tree-row root ${categoryId === "all" ? "is-selected" : ""}`} onClick={() => setCategoryId("all")}>{t("catalog.allCategories")}</button><CategoryTree categories={categories} locale={locale} selectedId={categoryId} expanded={expanded} onSelect={setCategoryId} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onEdit={openCategory} /></aside>
      <main><div className="catalog-toolbar"><div className="search-shell"><Search size={17} /><input aria-label={t("catalog.search")} className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("catalog.search")} /></div><span className="catalog-result-count">{t("catalog.resultCount", { count: blocks.length })}</span></div>
        <div className="catalog-notice">{t("catalog.provenanceNotice")}</div>
        <div className="catalog-grid">{blocks.map((block) => { const content = block.translations[locale] ?? block.translations.de; return <article className={`catalog-card ${block.lifecycle === "archived" ? "is-archived" : ""}`} key={block.id}><div className="catalog-card-header"><BlockVisual visualKey={block.visualKey} color={block.color} /><div><span className="catalog-code">{block.code} · {categoryPath(block.primaryCategoryId, categories, locale)}</span><h3>{content.title}</h3></div><BlockCardActions title={content.title} archived={block.lifecycle === "archived"} onDuplicate={() => duplicateBlock(block.id)} onRestore={() => restoreBlock(block.id)} onEdit={() => openBlock(block)} t={t} /></div><p>{content.shortDescription}</p><div className="catalog-regulations">{block.regulations.length ? block.regulations.map((regulation) => <span key={regulation}>{regulation}</span>) : <span>{t("catalog.noReferences")}</span>}</div><footer className="catalog-card-footer"><span>{block.categoryIds.length} {t("catalog.categoryAssignments")}</span></footer></article>; })}</div>
      </main>
    </div>
    <BlockEditorModal key={`block-${editingBlock?.id ?? "new"}-${blockOpen}`} open={blockOpen} block={editingBlock} categories={database.categories.filter((category) => category.lifecycle === "active")} locale={locale} onClose={() => setBlockOpen(false)} onSave={(block) => { saveBlock(block); setBlockOpen(false); }} onArchive={editingBlock && editingBlock.lifecycle === "active" ? () => { archiveBlock(editingBlock.id); setBlockOpen(false); } : undefined} t={t} />
    <CategoryEditorModal key={`category-${editingCategory?.id ?? "new"}-${categoryOpen}`} open={categoryOpen} category={editingCategory} categories={database.categories} locale={locale} onClose={() => setCategoryOpen(false)} onSave={(category) => { saveCategory(category); setCategoryOpen(false); }} onArchive={editingCategory && editingCategory.lifecycle === "active" ? () => { archiveCategory(editingCategory.id); setCategoryOpen(false); } : undefined} onRestore={editingCategory && editingCategory.lifecycle === "archived" ? () => { restoreCategory(editingCategory.id); setCategoryOpen(false); } : undefined} t={t} />
  </div>;
}

function BlockCardActions({ title, archived, onDuplicate, onRestore, onEdit, t }: { title: string; archived: boolean; onDuplicate: () => void; onRestore: () => void; onEdit: () => void; t: (key: string) => string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const runAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return <div className={`card-overflow ${open ? "is-open" : ""}`} ref={containerRef}>
    <button ref={triggerRef} type="button" className="icon-button card-overflow-trigger" aria-label={`${t("common.moreActions")}: ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}><EllipsisVertical size={17} /></button>
    {open && <div className="card-overflow-menu" role="menu" aria-label={t("common.moreActions")}>
      <button type="button" role="menuitem" onClick={() => runAction(onDuplicate)}><Copy size={15} />{t("common.duplicate")}</button>
      {archived && <button type="button" role="menuitem" onClick={() => runAction(onRestore)}><ArchiveRestore size={15} />{t("common.restore")}</button>}
      <button type="button" role="menuitem" onClick={() => runAction(onEdit)}><Pencil size={15} />{t("common.edit")}</button>
    </div>}
  </div>;
}

function CategoryTree({ categories, locale, selectedId, expanded, onSelect, onToggle, onEdit, parentId, depth = 0 }: { categories: BuildingBlockCategory[]; locale: Locale; selectedId: string; expanded: Set<string>; onSelect: (id: string) => void; onToggle: (id: string) => void; onEdit: (category: BuildingBlockCategory) => void; parentId?: string; depth?: number }) {
  return <>{categories.filter((category) => category.parentId === parentId).map((category) => {
    const hasChildren = categories.some((candidate) => candidate.parentId === category.id);
    const isExpanded = expanded.has(category.id);
    const categoryName = category.translations[locale].name;
    return <div key={category.id}><div className={`category-tree-row ${selectedId === category.id ? "is-selected" : ""}`} style={{ paddingLeft: 12 + depth * 18 }}><button className="category-expand" onClick={() => hasChildren && onToggle(category.id)} aria-label={categoryName} disabled={!hasChildren}>{hasChildren ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span />}</button><button className="category-name" onClick={() => onSelect(category.id)}><span style={{ backgroundColor: category.color }} />{categoryName}</button><button className="icon-button" onClick={() => onEdit(category)} aria-label={categoryName}><Pencil size={12} /></button></div>{hasChildren && isExpanded && <CategoryTree categories={categories} locale={locale} selectedId={selectedId} expanded={expanded} onSelect={onSelect} onToggle={onToggle} onEdit={onEdit} parentId={category.id} depth={depth + 1} />}</div>;
  })}</>;
}

function BlockEditorModal({ open, block, categories, locale, onClose, onSave, onArchive, t }: { open: boolean; block: BuildingBlock | null; categories: BuildingBlockCategory[]; locale: Locale; onClose: () => void; onSave: (block: BuildingBlock) => void; onArchive?: () => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState<BuildingBlock>(() => block ? structuredClone(block) : {
    id: newId("block"), code: "", primaryCategoryId: categories[0]?.id ?? "", categoryIds: categories[0] ? [categories[0].id] : [], visualKey: "safety", color: "#296c5d", regulations: [], tags: [], lifecycle: "active", provenance: { kind: "organization", label: "Organization content" }, translations: { de: { ...defaultContent }, en: { ...defaultContent } },
  });
  const updateTranslation = (locale: Locale, key: "title" | "shortDescription" | "longDescription" | "searchTerms", value: string | string[]) => setDraft((current) => current ? { ...current, translations: { ...current.translations, [locale]: { ...current.translations[locale], [key]: value } } } : current);
  const updateImage = (file?: File) => {
    if (!file) return;
    void readValidatedImageDataUrl(file)
      .then((imageDataUrl) => setDraft((current) => ({ ...current, imageDataUrl })))
      .catch(() => window.alert(t("catalog.invalidImage")));
  };
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); if (!draft.categoryIds.length) return; onSave({ ...draft, primaryCategoryId: draft.categoryIds.includes(draft.primaryCategoryId) ? draft.primaryCategoryId : draft.categoryIds[0] }); };
  return <Modal open={open} title={block ? t("catalog.editBlock") : t("catalog.addBlock")} onClose={onClose}><form onSubmit={handleSubmit}><div className="modal-body block-form"><div className="form-grid"><label className="field"><span>{t("catalog.code")}</span><input required value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label><label className="field"><span>{t("catalog.color")}</span><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></div>{(["de", "en"] as Locale[]).map((contentLocale) => <fieldset key={contentLocale}><legend>{contentLocale === "de" ? "Deutsch" : "English"}</legend><label className="field"><span>{t("catalog.blockTitle")}</span><input required value={draft.translations[contentLocale].title} onChange={(event) => updateTranslation(contentLocale, "title", event.target.value)} /></label><label className="field"><span>{t("catalog.shortDescription")}</span><textarea required value={draft.translations[contentLocale].shortDescription} onChange={(event) => updateTranslation(contentLocale, "shortDescription", event.target.value)} /></label><label className="field"><span>{t("catalog.longDescription")}</span><textarea value={draft.translations[contentLocale].longDescription} onChange={(event) => updateTranslation(contentLocale, "longDescription", event.target.value)} /></label><label className="field"><span>{t("catalog.localizedSearchTerms")}</span><input value={draft.translations[contentLocale].searchTerms.join(", ")} onChange={(event) => updateTranslation(contentLocale, "searchTerms", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} /></label></fieldset>)}<fieldset><legend>{t("catalog.categories")}</legend><div className="checkbox-grid">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={draft.categoryIds.includes(category.id)} onChange={(event) => setDraft({ ...draft, categoryIds: event.target.checked ? [...draft.categoryIds, category.id] : draft.categoryIds.filter((id) => id !== category.id) })} />{categoryPath(category.id, categories, locale)}</label>)}</div><label className="field"><span>{t("catalog.primaryCategory")}</span><select required value={draft.primaryCategoryId} onChange={(event) => setDraft({ ...draft, primaryCategoryId: event.target.value })}>{draft.categoryIds.map((id) => <option key={id} value={id}>{categoryPath(id, categories, locale)}</option>)}</select></label></fieldset><label className="field"><span>{t("catalog.image")}</span><input type="file" accept="image/png,image/jpeg" onChange={(event) => updateImage(event.target.files?.[0])} /></label>{draft.imageDataUrl && <div className="block-image-field"><img src={draft.imageDataUrl} alt="" /><Button type="button" size="small" variant="secondary" onClick={() => setDraft((current) => ({ ...current, imageDataUrl: undefined }))}>{t("common.remove")}</Button></div>}<label className="field"><span>{t("catalog.references")}</span><input value={draft.regulations.join(", ")} onChange={(event) => setDraft({ ...draft, regulations: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /><small>{t("catalog.referenceHelp")}</small></label><label className="field"><span>{t("catalog.tags")}</span><input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label><fieldset><legend>{t("catalog.provenanceDetails")}</legend><div className="form-grid"><label className="field"><span>{t("catalog.provenanceType")}</span><input readOnly value={t(`catalog.provenance.${draft.provenance.kind}`)} /></label><label className="field"><span>{t("catalog.sourceReference")}</span><input value={draft.provenance.sourceReference ?? ""} onChange={(event) => setDraft({ ...draft, provenance: { ...draft.provenance, sourceReference: event.target.value } })} /></label><label className="field"><span>{t("catalog.lastReviewed")}</span><input type="date" value={draft.provenance.verifiedAt ?? ""} onChange={(event) => setDraft({ ...draft, provenance: { ...draft.provenance, verifiedAt: event.target.value || undefined } })} /></label></div><small>{t("catalog.provenanceHelp")}</small></fieldset></div><div className="modal-footer">{onArchive && <Button type="button" variant="danger" onClick={onArchive}><Archive size={14} />{t("common.archive")}</Button>}<Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div></form></Modal>;
}

function CategoryEditorModal({ open, category, categories, locale: uiLocale, onClose, onSave, onArchive, onRestore, t }: { open: boolean; category: BuildingBlockCategory | null; categories: BuildingBlockCategory[]; locale: Locale; onClose: () => void; onSave: (category: BuildingBlockCategory) => void; onArchive?: () => void; onRestore?: () => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState<BuildingBlockCategory>(() => category ? structuredClone(category) : ({
    id: newId("category"),
    color: "#496f5f",
    sortOrder: categories.length,
    lifecycle: "active",
    translations: { de: { name: "", description: "" }, en: { name: "", description: "" } },
  }));
  const unavailableParentIds = category ? categoryDescendantIds(category.id, categories) : new Set<string>();
  return <Modal open={open} title={category ? t("catalog.editCategory") : t("catalog.addCategory")} onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSave(draft); }}><div className="modal-body form-grid"><label className="field"><span>{t("catalog.parentCategory")}</span><select value={draft.parentId ?? ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || undefined })}><option value="">—</option>{categories.filter((candidate) => candidate.lifecycle === "active" && !unavailableParentIds.has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{categoryPath(candidate.id, categories, uiLocale)}</option>)}</select></label><label className="field"><span>{t("catalog.color")}</span><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label><label className="field"><span>{t("catalog.sortOrder")}</span><input type="number" min="0" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} /></label>{(["de", "en"] as Locale[]).map((contentLocale) => <div className="field span-two" key={contentLocale}><span>{contentLocale === "de" ? "Deutsch" : "English"}</span><input required value={draft.translations[contentLocale].name} placeholder={t("catalog.categoryName")} onChange={(event) => setDraft({ ...draft, translations: { ...draft.translations, [contentLocale]: { ...draft.translations[contentLocale], name: event.target.value } } })} /><input value={draft.translations[contentLocale].description} placeholder={t("catalog.categoryDescription")} onChange={(event) => setDraft({ ...draft, translations: { ...draft.translations, [contentLocale]: { ...draft.translations[contentLocale], description: event.target.value } } })} /></div>)}</div><div className="modal-footer">{onArchive && <Button type="button" variant="danger" onClick={onArchive}>{t("common.archive")}</Button>}{onRestore && <Button type="button" variant="secondary" onClick={onRestore}>{t("common.restore")}</Button>}<Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div></form></Modal>;
}
