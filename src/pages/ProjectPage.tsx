import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { countProjectOverviewValues, invalidProjectOverviewEntryIds, ProjectOverviewFields } from "../components/ProjectOverviewFields";
import { Button, EmptyState } from "../components/Ui";
import { ProjectContactsPanel } from "../components/ProjectContactsPanel";
import type { ProjectOverviewSection } from "../domain/types";
import { normalizeProjectOverviewSectionOrder, PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { invalidProjectSectionIds } from "../domain/projectOverview";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const { getProject, updateProject } = useApp();
  const { t, formatDate } = useI18n();
  const project = getProject(projectId);
  if (!project) return <NotFoundPage />;
  const overviewSectionOrder = normalizeProjectOverviewSectionOrder(project.overviewSectionOrder, project.overviewSections);

  return <div className="workspace-page overview-page">
    <section className="overview-heading">
      <div><h1>{t("project.overview")}</h1><p>{t("project.overviewSubtitle")}</p></div>
      <Link to={`/projects/${project.id}/edit`}><Button variant="secondary"><Plus size={15} />{t("project.manageInformation")}</Button></Link>
    </section>
    <div className="overview-grid">{overviewSectionOrder.map((sectionId) => {
      if (sectionId === PROJECT_PARTICIPANTS_SECTION_ID) return <ProjectContactsPanel
        key={sectionId}
        projectId={project.id}
        title={project.participantsSectionName}
        onTitleChange={(participantsSectionName) => updateProject({ ...project, participantsSectionName })}
      />;
      const section = project.overviewSections.find((candidate) => candidate.id === sectionId);
      if (!section) return null;
      return <OverviewSectionCard
        key={section.id}
        section={section}
        isNameValid={(name) => !invalidProjectSectionIds({ ...project, overviewSections: project.overviewSections.map((candidate) => candidate.id === section.id ? { ...candidate, name } : candidate) }).has(section.id)}
        onChange={(nextSection) => updateProject({ ...project, overviewSections: project.overviewSections.map((candidate) => candidate.id === nextSection.id ? nextSection : candidate) })}
        onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, overviewSections: project.overviewSections.filter((candidate) => candidate.id !== section.id), overviewSectionOrder: project.overviewSectionOrder.filter((id) => id !== section.id) }); }}
        t={t}
        formatDate={formatDate}
      />;
    })}
    {overviewSectionOrder.length === 0 && <section className="panel overview-span-two"><EmptyState icon={<Plus />} title={t("project.noInformation")} text={t("project.noInformationText")} action={<Link to={`/projects/${project.id}/edit`}><Button>{t("project.manageInformation")}</Button></Link>} /></section>}
    </div>
  </div>;
}

function OverviewSectionCard({ section, isNameValid, onChange, onDelete, t, formatDate }: {
  section: ProjectOverviewSection;
  isNameValid: (name: string) => boolean;
  onChange: (section: ProjectOverviewSection) => void;
  onDelete: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(section));
  const invalidEntryIds = invalidProjectOverviewEntryIds(draft.entries);
  const draftValid = isNameValid(draft.name) && invalidEntryIds.size === 0;
  useEffect(() => { if (!editing) setDraft(structuredClone(section)); }, [editing, section]);
  return <section className="panel overview-template-section overview-span-two">
    <div className="panel-header"><div>{editing ? <input className="project-section-title-input" aria-label={t("project.sectionTitle")} aria-invalid={!isNameValid(draft.name)} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /> : <h2>{section.name}</h2>}{editing && !isNameValid(draft.name) && <small className="field-error" role="alert">{t("project.sectionNameUnique")}</small>}<span className="panel-kicker">{countProjectOverviewValues(section.entries)} {t("overview.entries")}</span></div><div className="row-actions">{editing ? <><Button size="small" variant="ghost" onClick={() => { setDraft(structuredClone(section)); setEditing(false); }}><X size={14} />{t("common.cancel")}</Button><Button size="small" disabled={!draftValid} onClick={() => { onChange({ ...draft, name: draft.name.trim() }); setEditing(false); }}><Check size={14} />{t("common.save")}</Button></> : <Button size="small" variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} />{t("common.edit")}</Button>}<button type="button" className="icon-button danger-icon" onClick={onDelete} aria-label={t("common.delete")}><Trash2 size={14} /></button></div></div>
    <div className="panel-body"><ProjectOverviewFields entries={draft.entries} editing={editing} structureEditing={editing} invalidEntryIds={invalidEntryIds} onChange={(entries) => setDraft((current) => ({ ...current, entries }))} t={t} formatDate={formatDate} /></div>
  </section>;
}
