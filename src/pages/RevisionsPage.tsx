import { Download, FileOutput, History } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, EmptyState } from "../components/Ui";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { getBlob } from "../data/blobRepository";
import { NotFoundPage } from "./NotFoundPage";

export function RevisionsPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, getPlanForProject } = useApp();
  const { locale, t, formatDate } = useI18n();
  const [exportError, setExportError] = useState("");
  const project = getProject(projectId);
  if (!project) return <NotFoundPage />;
  const revisions = database.revisions.filter((revision) => revision.projectId === project.id);
  const draftPlan = getPlanForProject(project.id);
  const draftDocuments = database.generatedDocuments.filter((document) => document.projectId === project.id);
  const downloadGeneratedDocument = async (blobId: string, filename: string) => {
    const blob = await getBlob(blobId); if (!blob) return;
    const { downloadBlob } = await import("../documents/templateEngine"); downloadBlob(blob, filename);
  };
  const exportRevisionWord = async (revision: typeof revisions[number]) => {
    setExportError("");
    try {
      const { blobToArrayBuffer, buildTemplateData, createStandardTemplate, downloadBlob, renderTemplate } = await import("../documents/templateEngine");
      const configuration = revision.snapshot.documentConfigurations.find((candidate) => candidate.documentType === "a4_plan");
      const selectedTemplate = revision.snapshot.documentTemplates.find((candidate) => candidate.id === configuration?.templateId)
        ?? revision.snapshot.documentTemplates.find((candidate) => candidate.documentType === "a4_plan" && candidate.locale === locale && candidate.origin === "standard");
      if (!selectedTemplate) throw new Error(t("documents.templateFileMissing"));
      const templateBlob = selectedTemplate.origin === "standard"
        ? await createStandardTemplate("a4_plan", locale)
        : selectedTemplate.blobId ? await getBlob(selectedTemplate.blobId) : undefined;
      if (!templateBlob) throw new Error(t("documents.templateFileMissing"));
      const data = buildTemplateData(
        revision.snapshot.project,
        revision.snapshot.plan,
        locale,
        revision.snapshot.blocks,
        revision.snapshot.categories,
        revision.snapshot.documentConfigurations,
      );
      const document = await renderTemplate(await blobToArrayBuffer(templateBlob), data);
      downloadBlob(document, `${revision.snapshot.project.projectNumber.toLowerCase()}-sige-plan-${revision.index}.docx`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : t("revision.exportFailed"));
    }
  };
  return <div className="workspace-page"><section className="overview-heading"><div><h1>{t("project.revisions")}</h1><p>{t("revision.subtitle")}</p></div></section>{exportError && <div className="form-error" role="alert">{exportError}</div>}
    <div className="revision-sections">
      <section className="panel"><div className="panel-header"><div><h2>{t("revision.currentDraft")}</h2><p>{t("revision.currentDraftText")}</p></div></div><div className="panel-body revision-list"><article className="revision-item"><span className="revision-index">—</span><span><strong>{draftPlan ? t("editor.planTitle") : project.name}</strong><span>{t("revision.lastChanged", { date: formatDate(draftPlan?.updatedAt ?? project.updatedAt) })}</span>{draftPlan && <span>{t("planCreation.sourceSummary", { method: t(`planCreation.method.${draftPlan.provenance.method}`) })}</span>}{draftPlan?.provenance.reason && <span>{t("planCreation.reasonSummary", { reason: draftPlan.provenance.reason })}</span>}<span>{draftDocuments.length ? t("revision.outputs", { count: draftDocuments.length }) : t("revision.noOutputs")}</span></span><span className="revision-actions"><Link to={`/projects/${project.id}/plan`}><Button size="small" variant="secondary">{t("revision.openDraft")}</Button></Link></span></article></div></section>
      {revisions.length === 0 ? <section className="panel"><EmptyState icon={<History />} title={t("revision.none")} text={t("revision.noneText")} /></section> : <section className="panel"><div className="panel-header"><h2>{t("revision.publishedRevisions")}</h2></div><div className="panel-body revision-list">{revisions.map((revision) => <article className="revision-item" key={revision.id}><span className="revision-index">{revision.index}</span><span><strong>{revision.changeSummary}</strong><span>{t("revision.published", { date: formatDate(revision.publishedAt) })}</span><span>{t("revision.approvedBy", { name: revision.approvedBy })}</span><span>{t("planCreation.sourceSummary", { method: t(`planCreation.method.${revision.snapshot.plan.provenance.method}`) })}</span>{revision.snapshot.plan.provenance.reason && <span>{t("planCreation.reasonSummary", { reason: revision.snapshot.plan.provenance.reason })}</span>}<span>{t("revision.snapshotSummary", { blocks: revision.snapshot.blocks.length, templates: revision.snapshot.documentTemplates.length })}</span></span><span className="revision-actions"><Button variant="secondary" size="small" onClick={() => void import("../export/exports").then(({ exportPlanPdf }) => exportPlanPdf(revision.snapshot.project, revision.snapshot.plan, revision.snapshot.blocks, revision.snapshot.categories, locale, revision))}><Download size={14} />A0 PDF</Button>{revision.snapshot.generatedDocuments.length === 0 && <Button variant="secondary" size="small" onClick={() => void exportRevisionWord(revision)}><FileOutput size={14} />A4 Word</Button>}{revision.snapshot.generatedDocuments.map((document) => <Button key={document.id} variant="secondary" size="small" onClick={() => void downloadGeneratedDocument(document.blobId, document.filename)}><FileOutput size={14} />{document.filename}</Button>)}</span></article>)}</div></section>}
    </div>
  </div>;
}
