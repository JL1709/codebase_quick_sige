import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { countProjectOverviewValues, invalidProjectOverviewEntryIds, ProjectOverviewFields } from "../components/ProjectOverviewFields";
import { Button, EmptyState } from "../components/Ui";
import { ProjectContactsPanel } from "../components/ProjectContactsPanel";
import type { ProjectOverviewSection } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const { getProject, updateProject } = useApp();
  const { t, formatDate } = useI18n();
  const project = getProject(projectId);
  if (!project) return <NotFoundPage />;

  return <div className="workspace-page overview-page">
    <section className="overview-heading">
      <div><h1>{t("project.overview")}</h1><p>{t("project.overviewSubtitle")}</p></div>
      <Link to={`/projects/${project.id}/edit`}><Button variant="secondary"><Plus size={15} />{t("project.manageInformation")}</Button></Link>
    </section>
    <div className="overview-grid"><ProjectContactsPanel projectId={project.id} />
    {project.overviewSections.length === 0 ? <section className="panel overview-span-two"><EmptyState icon={<Plus />} title={t("project.noInformation")} text={t("project.noInformationText")} action={<Link to={`/projects/${project.id}/edit`}><Button>{t("project.manageInformation")}</Button></Link>} /></section> : <>
      {project.overviewSections.map((section) => <OverviewSectionCard
        key={section.id}
        section={section}
        onChange={(nextSection) => updateProject({ ...project, overviewSections: project.overviewSections.map((candidate) => candidate.id === nextSection.id ? nextSection : candidate) })}
        onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, overviewSections: project.overviewSections.filter((candidate) => candidate.id !== section.id) }); }}
        t={t}
        formatDate={formatDate}
      />)}</>}
    </div>
  </div>;
}

function OverviewSectionCard({ section, onChange, onDelete, t, formatDate }: {
  section: ProjectOverviewSection;
  onChange: (section: ProjectOverviewSection) => void;
  onDelete: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(section));
  const invalidEntryIds = invalidProjectOverviewEntryIds(draft.entries);
  useEffect(() => { if (!editing) setDraft(structuredClone(section)); }, [editing, section]);
  return <section className="panel overview-template-section overview-span-two">
    <div className="panel-header"><div><h2>{section.name}</h2><span className="panel-kicker">{countProjectOverviewValues(section.entries)} {t("overview.entries")}</span></div><div className="row-actions">{editing ? <><Button size="small" variant="ghost" onClick={() => { setDraft(structuredClone(section)); setEditing(false); }}><X size={14} />{t("common.cancel")}</Button><Button size="small" disabled={invalidEntryIds.size > 0} onClick={() => { onChange(draft); setEditing(false); }}><Check size={14} />{t("common.save")}</Button></> : <Button size="small" variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} />{t("common.edit")}</Button>}<button type="button" className="icon-button danger-icon" onClick={onDelete} aria-label={t("common.delete")}><Trash2 size={14} /></button></div></div>
    <div className="panel-body"><ProjectOverviewFields entries={draft.entries} editing={editing} structureEditing={editing} invalidEntryIds={invalidEntryIds} onChange={(entries) => setDraft((current) => ({ ...current, entries }))} t={t} formatDate={formatDate} /></div>
  </section>;
}
