import { ArrowLeft, Check, ChevronDown, ChevronUp, Eye, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { OverviewEntryBuilder } from "../components/OverviewEntryBuilder";
import { ProjectOverviewFields } from "../components/ProjectOverviewFields";
import { Button, PageHeader } from "../components/Ui";
import { countOverviewEntries, instantiateOverviewSection, localizeOverviewTemplate, validateOverviewTemplate } from "../domain/overviewTemplates";
import { validateProjectForm } from "../domain/projectValidation";
import type { OverviewTemplate, OverviewTemplateEntry, ProjectOverviewSection } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectFormPage() {
  const { projectId } = useParams();
  const { database, createProject, getProject, updateProject } = useApp();
  const { locale, t, formatDate } = useI18n();
  const navigate = useNavigate();
  const existingProject = projectId ? getProject(projectId) : undefined;
  const [name, setName] = useState(existingProject?.name ?? "");
  const [sections, setSections] = useState<ProjectOverviewSection[]>(() => structuredClone(existingProject?.overviewSections ?? []));
  const [additionalEntries, setAdditionalEntries] = useState<OverviewTemplateEntry[]>([]);
  const [previewedTemplateIds, setPreviewedTemplateIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const additionalTemplate = useMemo<OverviewTemplate>(() => ({
    id: "project-additional-information",
    organizationId: database.organization.id,
    name: t("project.additionalInformation"),
    sourceLocale: locale,
    entries: additionalEntries,
    createdAt: "",
    updatedAt: "",
  }), [additionalEntries, database.organization.id, locale, t]);
  const additionalValidation = useMemo(() => validateOverviewTemplate(additionalTemplate, []), [additionalTemplate]);

  if (projectId && !existingProject) return <NotFoundPage />;

  const togglePreview = (templateId: string) => setPreviewedTemplateIds((current) => {
    const next = new Set(current);
    if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
    return next;
  });
  const includeTemplate = (template: OverviewTemplate) => {
    if (sections.some((section) => section.templateId === template.id)) return;
    setSections((current) => [...current, instantiateOverviewSection(template, newId, locale)]);
  };
  const removeSection = (sectionId: string) => setSections((current) => current.filter((section) => section.id !== sectionId));
  const updateSection = (sectionId: string, entries: ProjectOverviewSection["entries"]) => setSections((current) => current.map((section) => section.id === sectionId ? { ...section, entries } : section));
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !additionalValidation.valid) return;
    let overviewSections = sections;
    if (additionalEntries.length > 0) {
      const additionalSection = instantiateOverviewSection(additionalTemplate, newId, locale);
      const projectOnlySection = { ...additionalSection };
      Reflect.deleteProperty(projectOnlySection, "templateId");
      overviewSections = [...overviewSections, projectOnlySection];
    }
    const validation = validateProjectForm({ name, overviewSections });
    if (!validation.success) return;
    if (existingProject) {
      updateProject({ ...existingProject, name: validation.data.name, overviewSections: validation.data.overviewSections });
      navigate(`/projects/${existingProject.id}`);
      return;
    }
    const project = createProject(validation.data);
    navigate(`/projects/${project.id}`);
  };

  return <div className="page page-narrow project-form-page">
    <PageHeader
      eyebrow={t("dashboard.eyebrow")}
      title={t(existingProject ? "project.editTitle" : "project.createTitle")}
      description={t(existingProject ? "project.editSubtitle" : "project.createSubtitle")}
      action={<Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>}
    />
    <form className="project-composer" onSubmit={handleSubmit}>
      <section className="panel project-name-panel project-additional-fields">
        <div className="panel-body">
          <label className="field"><span>{t("project.name")}</span><input autoFocus required aria-invalid={submitted && !name.trim()} aria-describedby={submitted && !name.trim() ? "project-name-error" : undefined} value={name} onChange={(event) => setName(event.target.value)} /></label>
          {submitted && !name.trim() && <small id="project-name-error" className="field-error" role="alert">{t("project.nameRequired")}</small>}
          <div className="project-details-builder"><OverviewEntryBuilder entries={additionalEntries} invalidEntryIds={additionalValidation.invalidEntryIds} onChange={setAdditionalEntries} t={t} valueLabelKey="project.valueOptional" /></div>
        </div>
      </section>

      <section className="panel project-template-browser">
        <div className="panel-header"><div><h2>{t("project.useTemplates")}</h2><p>{t("project.useTemplatesText")}</p></div><LayoutTemplate size={19} /></div>
        <div className="panel-body project-template-cards">
          {database.overviewTemplates.map((template) => {
            const localizedTemplate = localizeOverviewTemplate(template, locale);
            const included = sections.some((section) => section.templateId === template.id);
            const previewed = previewedTemplateIds.has(template.id);
            return <article className={`project-template-card ${included ? "is-included" : ""}`} key={template.id}>
              <div className="project-template-card-heading"><div><strong>{localizedTemplate.name}</strong><span>{countOverviewEntries(localizedTemplate.entries)} {t("overview.entries")}</span></div><div className="row-actions"><Button type="button" size="small" variant="ghost" onClick={() => togglePreview(template.id)}><Eye size={14} />{previewed ? t("project.hidePreview") : t("project.previewTemplate")}{previewed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</Button><Button type="button" size="small" variant={included ? "secondary" : "primary"} disabled={included} onClick={() => includeTemplate(template)}>{included ? <><Check size={14} />{t("project.included")}</> : <><Plus size={14} />{t("project.includeTemplate")}</>}</Button></div></div>
              {previewed && <TemplatePreview entries={localizedTemplate.entries} t={t} />}
            </article>;
          })}
        </div>
      </section>

      {sections.map((section) => <section className="panel project-included-section" key={section.id}>
        <div className="panel-header"><div><h2>{section.name}</h2><p>{t("project.completeBeforeCreate")}</p></div><Button type="button" size="small" variant="ghost" onClick={() => removeSection(section.id)}><Trash2 size={14} />{t("common.remove")}</Button></div>
        <div className="panel-body"><ProjectOverviewFields entries={section.entries} editing onChange={(entries) => updateSection(section.id, entries)} t={t} formatDate={formatDate} /></div>
      </section>)}

      <div className="project-composer-footer"><Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button type="button" variant="secondary">{t("common.cancel")}</Button></Link><Button type="submit" disabled={!name.trim() || !additionalValidation.valid}>{existingProject ? t("common.save") : t("project.createAction")}</Button></div>
    </form>
  </div>;
}

function TemplatePreview({ entries, t, depth = 0 }: { entries: OverviewTemplateEntry[]; t: (key: string) => string; depth?: number }) {
  return <div className="project-template-preview">{entries.map((entry) => <div className="project-template-preview-entry" style={{ "--preview-depth": depth } as CSSProperties} key={entry.id}><span>{entry.label}</span><small>{t(`templates.entryType.${entry.type}`)}</small>{entry.children.length > 0 && <TemplatePreview entries={entry.children} t={t} depth={depth + 1} />}</div>)}</div>;
}
