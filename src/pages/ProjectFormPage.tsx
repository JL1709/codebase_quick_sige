import { ArrowLeft, ArrowRight } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, PageHeader } from "../components/Ui";
import { countOverviewEntries } from "../domain/overviewTemplates";
import { validateProjectForm } from "../domain/projectValidation";
import type { ConstructionType, Locale, ProjectFormValues } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectFormPage() {
  const { projectId } = useParams();
  const { database, createProject, getPlanForProject, getProject, updatePlan, updateProject } = useApp();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const existingProject = projectId ? getProject(projectId) : undefined;
  const [values, setValues] = useState<ProjectFormValues>(() => existingProject ? {
    projectNumber: existingProject.projectNumber,
    name: existingProject.name,
    description: existingProject.description,
    address: existingProject.address,
    city: existingProject.city,
    constructionType: existingProject.constructionType,
    startDate: existingProject.startDate,
    endDate: existingProject.endDate,
    documentLocale: existingProject.documentLocale,
    templateIds: [],
  } : {
    projectNumber: `QS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
    name: "",
    description: "",
    address: "",
    city: "",
    constructionType: "new_build",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    documentLocale: locale,
    templateIds: [],
  });
  const [formError, setFormError] = useState("");

  if (projectId && !existingProject) return <NotFoundPage />;

  const update = <Key extends keyof ProjectFormValues>(key: Key, value: ProjectFormValues[Key]) => setValues((current) => ({ ...current, [key]: value }));
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const validation = validateProjectForm(values);
    if (!validation.success) {
      setFormError(t("validation.projectForm"));
      return;
    }
    setFormError("");
    const normalizedValues = validation.data;
    const project = existingProject ? { ...existingProject, ...normalizedValues } : createProject(normalizedValues);
    if (existingProject) {
      updateProject(project);
      const existingPlan = getPlanForProject(existingProject.id);
      if (existingPlan && existingPlan.documentLocale !== normalizedValues.documentLocale) {
        updatePlan({
          ...existingPlan,
          documentLocale: normalizedValues.documentLocale,
          title: normalizedValues.documentLocale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan",
        });
      }
    }
    navigate(`/projects/${project.id}`);
  };

  return (
    <div className="page page-narrow">
      <PageHeader eyebrow={t("dashboard.eyebrow")} title={t(existingProject ? "project.editTitle" : "project.createTitle")} description={t(existingProject ? "project.editSubtitle" : "project.createSubtitle")} action={<Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>} />
      <form className="panel" onSubmit={handleSubmit}>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="panel-body form-grid">
          <label className="field"><span>{t("project.number")}</span><input required value={values.projectNumber} onChange={(event) => update("projectNumber", event.target.value)} /></label>
          <label className="field"><span>{t("project.name")}</span><input required autoFocus value={values.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label className="field span-two"><span>{t("project.description")}</span><textarea value={values.description} onChange={(event) => update("description", event.target.value)} /></label>
          <label className="field"><span>{t("project.address")}</span><input required value={values.address} onChange={(event) => update("address", event.target.value)} /></label>
          <label className="field"><span>{t("project.city")}</span><input required value={values.city} onChange={(event) => update("city", event.target.value)} /></label>
          <label className="field"><span>{t("project.type")}</span><select value={values.constructionType} onChange={(event) => update("constructionType", event.target.value as ConstructionType)}>{(["new_build", "renovation", "demolition"] as ConstructionType[]).map((type) => <option key={type} value={type}>{t(`project.type.${type}`)}</option>)}</select></label>
          <label className="field"><span>{t("project.documentLanguage")}</span><select value={values.documentLocale} onChange={(event) => update("documentLocale", event.target.value as Locale)}><option value="de">{t("common.language.de")}</option><option value="en">{t("common.language.en")}</option></select></label>
          <label className="field"><span>{t("project.start")}</span><input required type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
          <label className="field"><span>{t("project.end")}</span><input required type="date" min={values.startDate} value={values.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
          {!existingProject && <fieldset className="field span-two project-template-picker"><legend>{t("templates.applyOnCreate")}</legend><p className="field-help">{t("templates.applyOnCreateText")}</p><div className="project-template-list">{database.overviewTemplates.map((template) => <label key={template.id}><input type="checkbox" checked={values.templateIds?.includes(template.id) ?? false} onChange={(event) => update("templateIds", event.target.checked ? [...(values.templateIds ?? []), template.id] : (values.templateIds ?? []).filter((id) => id !== template.id))} /><span><strong>{template.name}</strong><small>{countOverviewEntries(template.entries)} {t("overview.entries")}</small></span></label>)}</div></fieldset>}
        </div>
        <div className="form-footer"><Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button type="button" variant="secondary">{t("common.cancel")}</Button></Link><Button type="submit">{existingProject ? t("common.save") : t("common.continue")}<ArrowRight size={16} /></Button></div>
      </form>
    </div>
  );
}
