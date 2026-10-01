import { DndContext, PointerSensor, pointerWithin, type DragEndEvent, type DragOverEvent, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { moveOverviewEntry, normalizeOverviewKey, type OverviewDropPosition } from "../domain/overviewTemplates";
import type { OverviewEntryType, OverviewTemplateEntry } from "../domain/types";
import { newId } from "../state/AppProvider";
import { FieldTypeHeading } from "./FieldTypeHeading";
import { Button } from "./Ui";

const overviewEntryTypes: OverviewEntryType[] = ["text", "date", "group", "repeating_group"];
type Translate = (key: string, params?: Record<string, string | number>) => string;

function newOverviewEntry(type: OverviewEntryType): OverviewTemplateEntry {
  return { id: newId("overview-entry"), label: "", type, defaultValue: "", children: [] };
}

function updateEntry(entries: OverviewTemplateEntry[], entryId: string, update: (entry: OverviewTemplateEntry) => OverviewTemplateEntry): OverviewTemplateEntry[] {
  return entries.map((entry) => entry.id === entryId
    ? update(entry)
    : { ...entry, children: updateEntry(entry.children, entryId, update) });
}

function deleteEntry(entries: OverviewTemplateEntry[], entryId: string): OverviewTemplateEntry[] {
  return entries
    .filter((entry) => entry.id !== entryId)
    .map((entry) => ({ ...entry, children: deleteEntry(entry.children, entryId) }));
}

export function OverviewEntryBuilder({ entries, invalidEntryIds, onChange, t, valueLabelKey = "templates.defaultValue" }: {
  entries: OverviewTemplateEntry[];
  invalidEntryIds: Set<string>;
  onChange: (entries: OverviewTemplateEntry[]) => void;
  t: Translate;
  valueLabelKey?: string;
}) {
  const [entryType, setEntryType] = useState<OverviewEntryType>("text");
  const [dropIndicator, setDropIndicator] = useState<{ entryId: string; position: OverviewDropPosition } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const addEntry = (type: OverviewEntryType, parentId?: string) => {
    const entry = newOverviewEntry(type);
    onChange(parentId
      ? updateEntry(entries, parentId, (parent) => ({ ...parent, children: [...parent.children, entry] }))
      : [...entries, entry]);
  };
  const changeEntryType = (entry: OverviewTemplateEntry, type: OverviewEntryType) => {
    const becomesScalar = type === "text" || type === "date";
    if (becomesScalar && entry.children.length > 0 && !window.confirm(t("templates.changeTypeRemovesChildren"))) return;
    onChange(updateEntry(entries, entry.id, (candidate) => ({
      ...candidate,
      type,
      defaultValue: type === "group" || type === "repeating_group" ? "" : candidate.defaultValue,
      children: becomesScalar ? [] : candidate.children,
    })));
  };
  const removeEntry = (entry: OverviewTemplateEntry) => {
    if (entry.children.length > 0 && !window.confirm(t("templates.deleteEntryWithChildren"))) return;
    onChange(deleteEntry(entries, entry.id));
  };
  const previewMove = (event: DragOverEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    if (!target?.entryId || !target.position) { setDropIndicator(null); return; }
    const result = moveOverviewEntry(entries, String(event.active.id), target.entryId, target.position);
    setDropIndicator(result.moved ? { entryId: target.entryId, position: target.position } : null);
  };
  const performMove = (event: DragEndEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    setDropIndicator(null);
    if (!target?.entryId || !target.position) return;
    const result = moveOverviewEntry(entries, String(event.active.id), target.entryId, target.position);
    if (result.moved) onChange(result.entries);
  };

  return <>
    <div className="template-builder-labels"><span /><span>{t("templates.entryLabel")}</span><FieldTypeHeading t={t} /><span>{t(valueLabelKey)}</span><span /></div>
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragOver={previewMove} onDragEnd={performMove} onDragCancel={() => setDropIndicator(null)}>
      <div className="template-entry-tree">
        {entries.length === 0 && <p className="template-empty">{t("templates.noEntries")}</p>}
        {entries.map((entry) => <BuilderEntry key={entry.id} entry={entry} depth={0} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} onUpdate={(entryId, update) => onChange(updateEntry(entries, entryId, update))} onTypeChange={changeEntryType} onDelete={removeEntry} onAddChild={(parentId) => addEntry("text", parentId)} t={t} valueLabelKey={valueLabelKey} />)}
      </div>
    </DndContext>
    <div className="template-add-entry"><select aria-label={t("templates.entryType")} value={entryType} onChange={(event) => setEntryType(event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select><Button type="button" variant="secondary" onClick={() => addEntry(entryType)}><Plus size={14} />{t("templates.addEntry")}</Button></div>
  </>;
}

function BuilderEntry({ entry, depth, invalidEntryIds, dropIndicator, onUpdate, onTypeChange, onDelete, onAddChild, t, valueLabelKey }: {
  entry: OverviewTemplateEntry;
  depth: number;
  invalidEntryIds: Set<string>;
  dropIndicator: { entryId: string; position: OverviewDropPosition } | null;
  onUpdate: (entryId: string, update: (entry: OverviewTemplateEntry) => OverviewTemplateEntry) => void;
  onTypeChange: (entry: OverviewTemplateEntry, type: OverviewEntryType) => void;
  onDelete: (entry: OverviewTemplateEntry) => void;
  onAddChild: (parentId: string) => void;
  t: Translate;
  valueLabelKey: string;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: entry.id });
  const before = useDroppable({ id: `${entry.id}:before`, data: { entryId: entry.id, position: "before" satisfies OverviewDropPosition } });
  const inside = useDroppable({ id: `${entry.id}:inside`, data: { entryId: entry.id, position: "inside" satisfies OverviewDropPosition }, disabled: entry.type !== "group" && entry.type !== "repeating_group" });
  const after = useDroppable({ id: `${entry.id}:after`, data: { entryId: entry.id, position: "after" satisfies OverviewDropPosition } });
  const isContainer = entry.type === "group" || entry.type === "repeating_group";
  const invalid = invalidEntryIds.has(entry.id);
  const missing = normalizeOverviewKey(entry.label, "").length === 0;
  const error = invalid ? (missing ? t("templates.entryLabelRequired") : t("templates.entryLabelUnique")) : "";
  const errorId = `project-entry-error-${entry.id}`;
  const rowStyle = { "--template-depth": depth, transform: CSS.Translate.toString(transform) } as CSSProperties;
  return <div className={`template-builder-node ${isDragging ? "is-dragging" : ""}`} ref={setDragRef} style={rowStyle}>
    <div ref={before.setNodeRef} className={`template-drop-zone drop-before ${dropIndicator?.entryId === entry.id && dropIndicator.position === "before" ? "is-active" : ""}`} />
    <div ref={inside.setNodeRef} className={`template-builder-row ${dropIndicator?.entryId === entry.id && dropIndicator.position === "inside" ? "drop-inside-active" : ""}`}>
      <button type="button" className="template-drag-handle" aria-label={t("templates.dragEntry")} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <div className="template-entry-label-field"><input required aria-invalid={invalid} aria-describedby={error ? errorId : undefined} aria-label={t("templates.entryLabel")} placeholder={t("templates.entryLabel")} value={entry.label} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, label: event.target.value }))} />{error && <small id={errorId} className="template-entry-inline-error" role="alert">{error}</small>}</div>
      <select aria-label={t("templates.entryType")} value={entry.type} onChange={(event) => onTypeChange(entry, event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select>
      {isContainer ? <button type="button" className="template-entry-value template-add-child" onClick={() => onAddChild(entry.id)}><Plus size={13} />{t("templates.addNestedEntry")}</button> : <input className="template-entry-value" type={entry.type === "date" ? "date" : "text"} aria-label={t(valueLabelKey)} placeholder={t(valueLabelKey)} value={entry.defaultValue} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, defaultValue: event.target.value }))} />}
      <button type="button" className="icon-button danger-icon" aria-label={t("common.delete")} onClick={() => onDelete(entry)}><Trash2 size={15} /></button>
    </div>
    {entry.children.length > 0 && <div className="template-builder-children">{entry.children.map((child) => <BuilderEntry key={child.id} entry={child} depth={depth + 1} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} onUpdate={onUpdate} onTypeChange={onTypeChange} onDelete={onDelete} onAddChild={onAddChild} t={t} valueLabelKey={valueLabelKey} />)}</div>}
    <div ref={after.setNodeRef} className={`template-drop-zone drop-after ${dropIndicator?.entryId === entry.id && dropIndicator.position === "after" ? "is-active" : ""}`} />
  </div>;
}
