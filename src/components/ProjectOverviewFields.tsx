import {
  DndContext,
  PointerSensor,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { instantiateRepeatingItem, normalizeOverviewKey, type OverviewDropPosition } from "../domain/overviewTemplates";
import { moveProjectOverviewEntry, moveProjectOverviewRecord } from "../domain/projectOverview";
import type { OverviewEntryType, ProjectOverviewEntry } from "../domain/types";
import { newId } from "../state/AppProvider";
import { Button } from "./Ui";

type Translate = (key: string, params?: Record<string, string | number>) => string;
const overviewEntryTypes: OverviewEntryType[] = ["text", "date", "group", "repeating_group"];
const emptyInvalidEntryIds = new Set<string>();

function newProjectOverviewEntry(type: OverviewEntryType): ProjectOverviewEntry {
  const id = newId("project-entry");
  return { id, label: "", placeholderKey: id, type, value: "", children: [], items: [] };
}

function synchronizeEntryWithStructure(structure: ProjectOverviewEntry, valueEntry?: ProjectOverviewEntry): ProjectOverviewEntry {
  const sameType = valueEntry?.type === structure.type;
  return {
    ...structure,
    id: valueEntry?.id ?? newId("project-entry"),
    value: sameType ? valueEntry?.value ?? "" : "",
    children: structure.children.map((child, index) => synchronizeEntryWithStructure(child, valueEntry?.children[index])),
    items: structure.type === "repeating_group" && sameType
      ? (valueEntry?.items ?? []).map((item) => structure.children.map((child, index) => synchronizeEntryWithStructure(child, item[index])))
      : [],
  };
}

function synchronizeRepeatingItems(structure: ProjectOverviewEntry[], items: ProjectOverviewEntry[][]): ProjectOverviewEntry[][] {
  return items.map((item) => structure.map((entry, index) => synchronizeEntryWithStructure(entry, item[index])));
}

function synchronizeAllRepeatingItems(entries: ProjectOverviewEntry[]): ProjectOverviewEntry[] {
  return entries.map((entry) => {
    const children = synchronizeAllRepeatingItems(entry.children);
    return {
      ...entry,
      children,
      items: entry.type === "repeating_group" ? synchronizeRepeatingItems(children, entry.items) : [],
    };
  });
}

export function invalidProjectOverviewEntryIds(entries: ProjectOverviewEntry[]): Set<string> {
  const invalidIds = new Set<string>();
  const visit = (siblings: ProjectOverviewEntry[]) => {
    const keyCounts = new Map<string, number>();
    siblings.forEach((entry) => {
      const key = normalizeOverviewKey(entry.label, "");
      if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    });
    siblings.forEach((entry) => {
      const key = normalizeOverviewKey(entry.label, "");
      if (!key || (keyCounts.get(key) ?? 0) > 1) invalidIds.add(entry.id);
      visit(entry.children);
    });
  };
  visit(entries);
  return invalidIds;
}

export function updateProjectOverviewEntries(
  entries: ProjectOverviewEntry[],
  entryId: string,
  update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry,
): ProjectOverviewEntry[] {
  return entries.map((entry) => {
    const nestedEntry = {
      ...entry,
      children: updateProjectOverviewEntries(entry.children, entryId, update),
      items: entry.items.map((item) => updateProjectOverviewEntries(item, entryId, update)),
    };
    return entry.id === entryId ? update(nestedEntry) : nestedEntry;
  });
}

function deleteProjectOverviewEntry(entries: ProjectOverviewEntry[], entryId: string): ProjectOverviewEntry[] {
  return entries
    .filter((entry) => entry.id !== entryId)
    .map((entry) => ({
      ...entry,
      children: deleteProjectOverviewEntry(entry.children, entryId),
      items: entry.items.map((item) => deleteProjectOverviewEntry(item, entryId)),
    }));
}

export function countProjectOverviewValues(entries: ProjectOverviewEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.type === "repeating_group") return total + 1 + entry.items.reduce((itemTotal, item) => itemTotal + countProjectOverviewValues(item), 0);
    return total + 1 + countProjectOverviewValues(entry.children);
  }, 0);
}

export function ProjectOverviewFields({
  entries,
  editing,
  onChange,
  t,
  formatDate,
  structureEditing = false,
  invalidEntryIds = emptyInvalidEntryIds,
}: {
  entries: ProjectOverviewEntry[];
  editing: boolean;
  onChange: (entries: ProjectOverviewEntry[]) => void;
  t: Translate;
  formatDate: (value: string) => string;
  structureEditing?: boolean;
  schemaOnly?: boolean;
  invalidEntryIds?: Set<string>;
}) {
  if (structureEditing) return <ProjectOverviewEditor entries={entries} invalidEntryIds={invalidEntryIds} onChange={onChange} t={t} formatDate={formatDate} />;
  return <ProjectOverviewValueFields entries={entries} editing={editing} onChange={onChange} t={t} formatDate={formatDate} />;
}

function ProjectOverviewValueFields({ entries, editing, onChange, t, formatDate }: {
  entries: ProjectOverviewEntry[];
  editing: boolean;
  onChange: (entries: ProjectOverviewEntry[]) => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  const updateEntry = (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => {
    onChange(updateProjectOverviewEntries(entries, entryId, update));
  };
  return <div className="overview-template-values">
    {entries.map((entry) => <ProjectOverviewValueEntry key={entry.id} entry={entry} editing={editing} onUpdate={updateEntry} t={t} formatDate={formatDate} />)}
  </div>;
}

function ProjectOverviewValueEntry({ entry, editing, onUpdate, t, formatDate }: {
  entry: ProjectOverviewEntry;
  editing: boolean;
  onUpdate: (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  if (entry.type === "text" || entry.type === "date") return <div className={`detail-item overview-template-value ${editing ? "is-editing" : ""}`}>
    <label>{entry.label}</label>
    {editing
      ? <input aria-label={entry.label || t("project.valueOptional")} type={entry.type === "date" ? "date" : "text"} value={entry.value} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, value: event.target.value }))} />
      : <p>{entry.type === "date" && entry.value ? formatDate(entry.value) : entry.value || "—"}</p>}
  </div>;

  if (entry.type === "group") return <section className="overview-value-group overview-standard-group">
    <h3>{entry.label}</h3>
    <ProjectOverviewValueFields entries={entry.children} editing={editing} onChange={(children) => onUpdate(entry.id, (candidate) => ({ ...candidate, children }))} t={t} formatDate={formatDate} />
  </section>;

  return <section className="overview-value-group overview-repeat-group">
    <div className="overview-value-group-header"><h3>{entry.label}</h3>{editing && <Button type="button" size="small" variant="secondary" disabled={entry.children.length === 0} onClick={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: [...candidate.items, instantiateRepeatingItem(candidate, newId)] }))}><Plus size={13} />{t("overview.addRecord")}</Button>}</div>
    <div className="overview-repeat-items">{entry.items.map((item, index) => <article className="overview-repeat-item" key={item[0]?.id ?? `${entry.id}-${index}`}>
      {editing && <div className="overview-repeat-item-actions"><button type="button" className="icon-button danger-icon" aria-label={t("overview.removeRecord")} onClick={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: candidate.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={14} /></button></div>}
      <ProjectOverviewValueFields entries={item} editing={editing} onChange={(nextItem) => onUpdate(entry.id, (candidate) => ({ ...candidate, items: candidate.items.map((candidateItem, itemIndex) => itemIndex === index ? nextItem : candidateItem) }))} t={t} formatDate={formatDate} />
    </article>)}</div>
  </section>;
}

function ProjectOverviewEditor({ entries, invalidEntryIds, onChange, t, formatDate }: {
  entries: ProjectOverviewEntry[];
  invalidEntryIds: Set<string>;
  onChange: (entries: ProjectOverviewEntry[]) => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  const [entryType, setEntryType] = useState<OverviewEntryType>("text");
  const [dropIndicator, setDropIndicator] = useState<{ entryId: string; position: OverviewDropPosition } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const updateStructure = (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => {
    onChange(synchronizeAllRepeatingItems(updateProjectOverviewEntries(entries, entryId, update)));
  };
  const addEntry = (type: OverviewEntryType, parentId?: string) => {
    const entry = newProjectOverviewEntry(type);
    onChange(parentId
      ? synchronizeAllRepeatingItems(updateProjectOverviewEntries(entries, parentId, (parent) => ({ ...parent, children: [...parent.children, entry] })))
      : [...entries, entry]);
  };
  const changeEntryType = (entry: ProjectOverviewEntry, type: OverviewEntryType) => {
    const losesNestedData = (type === "text" || type === "date") && (entry.children.length > 0 || entry.items.length > 0);
    if (losesNestedData && !window.confirm(t("templates.changeTypeRemovesChildren"))) return;
    updateStructure(entry.id, (candidate) => ({
      ...candidate,
      type,
      value: type === "group" || type === "repeating_group" ? "" : candidate.value,
      children: type === "text" || type === "date" ? [] : candidate.children,
      items: type === "repeating_group" ? candidate.items : [],
    }));
  };
  const removeEntry = (entry: ProjectOverviewEntry) => {
    if ((entry.children.length > 0 || entry.items.length > 0) && !window.confirm(t("templates.deleteEntryWithChildren"))) return;
    onChange(synchronizeAllRepeatingItems(deleteProjectOverviewEntry(entries, entry.id)));
  };
  const previewMove = (event: DragOverEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    if (!target?.entryId || !target.position) { setDropIndicator(null); return; }
    const result = moveProjectOverviewEntry(entries, String(event.active.id), target.entryId, target.position);
    setDropIndicator(result.moved ? { entryId: target.entryId, position: target.position } : null);
  };
  const performMove = (event: DragEndEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    setDropIndicator(null);
    if (!target?.entryId || !target.position) return;
    const result = moveProjectOverviewEntry(entries, String(event.active.id), target.entryId, target.position);
    if (result.moved) onChange(result.entries);
  };

  return <div className="project-overview-editor">
    <div className="project-overview-editor-labels"><span /><span>{t("templates.entryLabel")}</span><span>{t("templates.entryType")}</span><span>{t("project.valueOptional")}</span><span /></div>
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragOver={previewMove} onDragEnd={performMove} onDragCancel={() => setDropIndicator(null)}>
      <div className="project-overview-entry-tree">
        {entries.length === 0 && <p className="template-empty">{t("templates.noEntries")}</p>}
        {entries.map((entry) => <ProjectOverviewBuilderEntry key={entry.id} entry={entry} depth={0} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} onUpdate={updateStructure} onTypeChange={changeEntryType} onDelete={removeEntry} onAddChild={(parentId) => addEntry("text", parentId)} t={t} formatDate={formatDate} />)}
      </div>
    </DndContext>
    <div className="project-overview-add-entry"><select aria-label={t("templates.entryType")} value={entryType} onChange={(event) => setEntryType(event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select><Button type="button" size="small" variant="secondary" onClick={() => addEntry(entryType)}><Plus size={13} />{t("templates.addEntry")}</Button></div>
  </div>;
}

function ProjectOverviewBuilderEntry({ entry, depth, invalidEntryIds, dropIndicator, onUpdate, onTypeChange, onDelete, onAddChild, t, formatDate }: {
  entry: ProjectOverviewEntry;
  depth: number;
  invalidEntryIds: Set<string>;
  dropIndicator: { entryId: string; position: OverviewDropPosition } | null;
  onUpdate: (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => void;
  onTypeChange: (entry: ProjectOverviewEntry, type: OverviewEntryType) => void;
  onDelete: (entry: ProjectOverviewEntry) => void;
  onAddChild: (parentId: string) => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: entry.id });
  const before = useDroppable({ id: `${entry.id}:before`, data: { entryId: entry.id, position: "before" satisfies OverviewDropPosition } });
  const inside = useDroppable({ id: `${entry.id}:inside`, data: { entryId: entry.id, position: "inside" satisfies OverviewDropPosition }, disabled: entry.type !== "group" && entry.type !== "repeating_group" });
  const after = useDroppable({ id: `${entry.id}:after`, data: { entryId: entry.id, position: "after" satisfies OverviewDropPosition } });
  const isContainer = entry.type === "group" || entry.type === "repeating_group";
  const invalid = invalidEntryIds.has(entry.id);
  const missingLabel = !normalizeOverviewKey(entry.label, "");
  const errorId = `project-entry-error-${entry.id}`;
  const rowStyle = { "--project-entry-depth": depth, transform: CSS.Translate.toString(transform) } as CSSProperties;
  const updateLabel = (label: string) => onUpdate(entry.id, (candidate) => ({ ...candidate, label, placeholderKey: normalizeOverviewKey(label, candidate.id) }));
  return <div className={`project-overview-builder-node ${isContainer ? "is-container" : ""} ${isDragging ? "is-dragging" : ""}`} ref={setDragRef} style={rowStyle} data-project-entry-id={entry.id}>
    <div ref={before.setNodeRef} className={`project-overview-drop-zone drop-before ${dropIndicator?.entryId === entry.id && dropIndicator.position === "before" ? "is-active" : ""}`} />
    <div ref={inside.setNodeRef} className={`project-overview-builder-row ${dropIndicator?.entryId === entry.id && dropIndicator.position === "inside" ? "drop-inside-active" : ""}`}>
      <button type="button" className="template-drag-handle" aria-label={t("templates.dragEntry")} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <div className="project-overview-label-field"><input className="overview-entry-label-input" required aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} aria-label={t("templates.entryLabel")} placeholder={t("templates.entryLabel")} value={entry.label} onChange={(event) => updateLabel(event.target.value)} />{invalid && <small id={errorId} className="template-entry-inline-error" role="alert">{t(missingLabel ? "templates.entryLabelRequired" : "templates.entryLabelUnique")}</small>}</div>
      <select aria-label={t("templates.entryType")} value={entry.type} onChange={(event) => onTypeChange(entry, event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select>
      {isContainer
        ? <button type="button" className="template-add-child" onClick={() => onAddChild(entry.id)}><Plus size={13} />{t("templates.addNestedEntry")}</button>
        : <input className="project-overview-value-input" aria-label={entry.label || t("project.valueOptional")} type={entry.type === "date" ? "date" : "text"} value={entry.value} placeholder={t("project.valueOptional")} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, value: event.target.value }))} />}
      <button type="button" className="icon-button danger-icon" aria-label={`${t("common.delete")}: ${entry.label || t("templates.entryLabel")}`} onClick={() => onDelete(entry)}><Trash2 size={15} /></button>
    </div>
    {entry.children.length > 0 && <div className="project-overview-builder-children">{entry.children.map((child) => <ProjectOverviewBuilderEntry key={child.id} entry={child} depth={depth + 1} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} onUpdate={onUpdate} onTypeChange={onTypeChange} onDelete={onDelete} onAddChild={onAddChild} t={t} formatDate={formatDate} />)}</div>}
    {entry.type === "repeating_group" && <RepeatingRecordEditor entry={entry} onUpdate={onUpdate} t={t} formatDate={formatDate} />}
    <div ref={after.setNodeRef} className={`project-overview-drop-zone drop-after ${dropIndicator?.entryId === entry.id && dropIndicator.position === "after" ? "is-active" : ""}`} />
  </div>;
}

function RepeatingRecordEditor({ entry, onUpdate, t, formatDate }: {
  entry: ProjectOverviewEntry;
  onUpdate: (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  const [dropIndex, setDropIndex] = useState<{ index: number; position: "before" | "after" } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const moveRecord = (event: DragEndEvent) => {
    const activeIndex = Number(event.active.data.current?.recordIndex);
    const target = event.over?.data.current as { recordIndex?: number; position?: "before" | "after" } | undefined;
    setDropIndex(null);
    if (!Number.isInteger(activeIndex) || target?.recordIndex === undefined || !target.position) return;
    const next = moveProjectOverviewRecord(entry.items, activeIndex, target.recordIndex, target.position);
    if (next !== entry.items) onUpdate(entry.id, (candidate) => ({ ...candidate, items: next }));
  };
  return <div className="project-overview-record-editor">
    <div className="project-overview-record-heading"><span>{t("overview.entries")}</span><Button type="button" size="small" variant="secondary" disabled={entry.children.length === 0} onClick={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: [...candidate.items, instantiateRepeatingItem(candidate, newId)] }))}><Plus size={13} />{t("overview.addRecord")}</Button></div>
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragOver={(event) => {
      const target = event.over?.data.current as { recordIndex?: number; position?: "before" | "after" } | undefined;
      setDropIndex(target?.recordIndex === undefined || !target.position ? null : { index: target.recordIndex, position: target.position });
    }} onDragEnd={moveRecord} onDragCancel={() => setDropIndex(null)}>
      <div className="project-overview-record-list">{entry.items.map((item, index) => <ProjectOverviewRecord key={item[0]?.id ?? `${entry.id}-${index}`} item={item} index={index} dropIndex={dropIndex} onChange={(nextItem) => onUpdate(entry.id, (candidate) => ({ ...candidate, items: candidate.items.map((candidateItem, itemIndex) => itemIndex === index ? nextItem : candidateItem) }))} onDelete={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: candidate.items.filter((_, itemIndex) => itemIndex !== index) }))} t={t} formatDate={formatDate} />)}</div>
    </DndContext>
  </div>;
}

function ProjectOverviewRecord({ item, index, dropIndex, onChange, onDelete, t, formatDate }: {
  item: ProjectOverviewEntry[];
  index: number;
  dropIndex: { index: number; position: "before" | "after" } | null;
  onChange: (item: ProjectOverviewEntry[]) => void;
  onDelete: () => void;
  t: Translate;
  formatDate: (value: string) => string;
}) {
  const recordId = item[0]?.id ?? `empty-${index}`;
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: `record:${recordId}`, data: { recordIndex: index } });
  const before = useDroppable({ id: `record:${recordId}:before`, data: { recordIndex: index, position: "before" as const } });
  const after = useDroppable({ id: `record:${recordId}:after`, data: { recordIndex: index, position: "after" as const } });
  return <article ref={setDragRef} style={{ transform: CSS.Translate.toString(transform) }} className={`project-overview-record ${isDragging ? "is-dragging" : ""}`}>
    <div ref={before.setNodeRef} className={`project-record-drop-zone drop-before ${dropIndex?.index === index && dropIndex.position === "before" ? "is-active" : ""}`} />
    <div className="project-overview-record-actions"><button type="button" className="template-drag-handle" aria-label={t("templates.dragEntry")} {...attributes} {...listeners}><GripVertical size={16} /></button><button type="button" className="icon-button danger-icon" aria-label={t("overview.removeRecord")} onClick={onDelete}><Trash2 size={14} /></button></div>
    <ProjectOverviewValueFields entries={item} editing onChange={onChange} t={t} formatDate={formatDate} />
    <div ref={after.setNodeRef} className={`project-record-drop-zone drop-after ${dropIndex?.index === index && dropIndex.position === "after" ? "is-active" : ""}`} />
  </article>;
}
