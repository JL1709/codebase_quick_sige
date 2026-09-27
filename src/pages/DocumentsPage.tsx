import { BellRing, Building, CheckCircle2, ClipboardList, Download, FileImage, FileText, Flame, HeartPulse, Settings, Siren, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Modal } from "../components/Ui";
import { blobObjectUrl, getBlob, saveBlob } from "../data/blobRepository";
import { inspectPdf } from "../documents/pdfPreview";
import { hasValidProjectAssetSignature, MAX_PROJECT_ASSET_TOTAL_BYTES, validateProjectAsset } from "../domain/projectAssets";
import { hydrateBlockImages } from "../domain/blockImages";
import type { DocumentTemplate, DocumentType, ProjectAsset } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

const documentTypes: Array<{ type: DocumentType; icon: typeof BellRing }> = [
  { type: "a4_plan", icon: FileText }, { type: "site_rules", icon: ClipboardList }, { type: "alarm_plan", icon: Siren },
  { type: "fire_safety", icon: Flame }, { type: "first_aid", icon: HeartPulse }, { type: "participants", icon: Building }, { type: "advance_notice", icon: BellRing },
];

interface PendingGeneration { type: DocumentType; template: DocumentTemplate; templateBuffer: ArrayBuffer; missing: string[] }

export function DocumentsPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, getPlanForProject, updateProject, setDocumentTemplate, addGeneratedDocument } = useApp();
  const { locale, t } = useI18n();
  const project = getProject(projectId);
  const plan = getPlanForProject(projectId);
  const [assetMessage, setAssetMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [documentMessage, setDocumentMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, setPending] = useState<PendingGeneration | null>(null);
  const [generating, setGenerating] = useState<DocumentType | null>(null);
  if (!project) return <NotFoundPage />;
  const templates = database.documentTemplates.filter((template) => template.locale === project.documentLocale && template.lifecycle !== "archived");
  const configurations = database.documentConfigurations.filter((configuration) => configuration.projectId === project.id);

  const selectedTemplate = (type: DocumentType) => {
    const configuredId = configurations.find((configuration) => configuration.documentType === type)?.templateId;
    return templates.find((template) => template.id === configuredId) ?? templates.find((template) => template.documentType === type && template.origin === "standard") ?? templates.find((template) => template.documentType === type);
  };
  const selectTemplate = (type: DocumentType, templateId: string) => setDocumentTemplate({ id: newId("document-config"), projectId: project.id, documentType: type, templateId });

  const handleAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const validation = validateProjectAsset(file);
    if (!validation.valid) { setAssetMessage({ tone: "danger", text: t(`documents.assetError.${validation.reason}`) }); return; }
    if (project.assets.reduce((total, asset) => total + asset.byteSize, 0) + file.size > MAX_PROJECT_ASSET_TOTAL_BYTES) { setAssetMessage({ tone: "danger", text: t("documents.assetError.storage") }); return; }
    try {
      if (!await hasValidProjectAssetSignature(file, validation.mimeType)) { setAssetMessage({ tone: "danger", text: t("documents.assetError.type") }); return; }
      const blobId = newId("asset-blob");
      await saveBlob(blobId, file);
      const pdfInspection = validation.mimeType === "application/pdf" ? await inspectPdf(file) : undefined;
      const previewDataUrl = pdfInspection?.previewDataUrl;
      let previewBlobId: string | undefined;
      if (previewDataUrl) {
        previewBlobId = newId("asset-preview");
        const previewBlob = await (await fetch(previewDataUrl)).blob();
        await saveBlob(previewBlobId, previewBlob);
      }
      const asset: ProjectAsset = { id: newId("asset"), filename: validation.filename, mimeType: validation.mimeType, byteSize: file.size, blobId, previewBlobId, pageCount: pdfInspection?.pageCount, createdAt: new Date().toISOString() };
      updateProject({ ...project, assets: [...project.assets, asset] });
      setAssetMessage({ tone: "success", text: t("documents.assetAdded", { name: asset.filename }) });
    } catch { setAssetMessage({ tone: "danger", text: t("documents.assetError.read") }); }
  };

  const templateBuffer = async (template: DocumentTemplate): Promise<ArrayBuffer> => {
    if (template.origin === "standard") {
      const { blobToArrayBuffer, createStandardTemplate } = await import("../documents/templateEngine");
      return blobToArrayBuffer(await createStandardTemplate(template.documentType, template.locale));
    }
    if (!template.blobId) throw new Error(t("documents.templateFileMissing"));
    const blob = await getBlob(template.blobId);
    if (!blob) throw new Error(t("documents.templateFileMissing"));
    return blob.arrayBuffer();
  };
  const startGeneration = async (type: DocumentType) => {
    const template = selectedTemplate(type);
    if (!template) { setDocumentMessage({ tone: "danger", text: t("documents.noTemplate") }); return; }
    setGenerating(type); setDocumentMessage(null);
    try {
      const { buildTemplateData, inspectTemplate } = await import("../documents/templateEngine");
      const buffer = await templateBuffer(template);
      const data = buildTemplateData(project, plan, database.blocks, database.categories, configurations);
      const inspection = await inspectTemplate(buffer, data);
      if (inspection.unsafeCommands.length) { setDocumentMessage({ tone: "danger", text: t("documents.unsafeTemplate", { commands: inspection.unsafeCommands.join(", ") }) }); return; }
      if (inspection.missingPlaceholders.length) { setPending({ type, template, templateBuffer: buffer, missing: inspection.missingPlaceholders }); return; }
      await finishGeneration(type, template, buffer);
    } catch (error) { setDocumentMessage({ tone: "danger", text: error instanceof Error ? error.message : t("documents.generationFailed") }); }
    finally { setGenerating(null); }
  };
  const finishGeneration = async (type: DocumentType, template: DocumentTemplate, buffer: ArrayBuffer) => {
    const { buildTemplateData, documentDependencyFingerprint, downloadBlob, renderTemplate } = await import("../documents/templateEngine");
    const blocksWithImages = await hydrateBlockImages(database.blocks);
    const generated = await renderTemplate(buffer, buildTemplateData(project, plan, blocksWithImages, database.categories, configurations));
    const safeProject = project.projectNumber.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const filename = `${safeProject}-${type}-${new Date().toISOString().slice(0, 10)}.docx`;
    const blobId = newId("generated-blob"); await saveBlob(blobId, generated);
    addGeneratedDocument({
      id: newId("generated-document"), projectId: project.id, documentType: type, templateId: template.id,
      templateRevision: template.revision ?? 1, filename, blobId, projectSnapshot: structuredClone(project),
      planSnapshot: plan ? structuredClone(plan) : undefined, language: project.documentLocale,
      generatedAt: new Date().toISOString(), dependencyFingerprint: documentDependencyFingerprint(project, plan), stale: false,
    });
    downloadBlob(generated, filename); setDocumentMessage({ tone: "success", text: t("documents.generated", { name: filename }) });
  };
  const proceedWithMissing = async () => { if (!pending) return; setGenerating(pending.type); try { await finishGeneration(pending.type, pending.template, pending.templateBuffer); setPending(null); } catch { setDocumentMessage({ tone: "danger", text: t("documents.generationFailed") }); } finally { setGenerating(null); } };

  return <div className="workspace-page">
    <section className="overview-heading"><div><h1>{t("documents.title")}</h1><p>{t("documents.subtitle")}</p></div><Link to="/templates"><Button variant="secondary"><Settings size={15} />{t("documents.manageTemplates")}</Button></Link></section>
    {documentMessage && <div className={`asset-message is-${documentMessage.tone}`}>{documentMessage.text}</div>}
    <section className="panel asset-panel"><div className="panel-header"><div><h2>{t("documents.assetsTitle")}</h2><p>{t("documents.assetsSubtitle")}</p></div><label className="button button-primary button-small asset-upload"><Upload size={14} />{t("documents.uploadAsset")}<input type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" onChange={(event) => void handleAsset(event)} /></label></div><div className="panel-body">{assetMessage && <div className={`asset-message is-${assetMessage.tone}`}>{assetMessage.tone === "success" && <CheckCircle2 size={15} />}{assetMessage.text}</div>}{project.assets.length === 0 ? <p className="page-description">{t("documents.noAssets")}</p> : <div className="asset-list">{project.assets.map((asset) => <article className="asset-row" key={asset.id}><span className="asset-preview"><AssetPreview asset={asset} /></span><span><strong>{asset.filename}</strong><small>{asset.mimeType === "application/pdf" ? "PDF" : <><FileImage size={11} /> {asset.mimeType === "image/png" ? "PNG" : "JPG"}</>} · {new Intl.NumberFormat(locale).format(Math.ceil(asset.byteSize / 1024))} KB</small></span><span className="asset-availability">{t("documents.availableInPlan")}</span></article>)}</div>}</div></section>
    <div className="document-grid">{documentTypes.map(({ type, icon: Icon }) => { const options = templates.filter((template) => template.documentType === type); const selected = selectedTemplate(type); return <article className="document-card" key={type}><span className="document-card-icon"><Icon size={21} /></span><h3>{t(`documents.${type}`)}</h3><p>{t("documents.templateUsed")}</p><select className="document-template-select" value={selected?.id ?? ""} onChange={(event) => selectTemplate(type, event.target.value)}>{options.length === 0 && <option value="">{t("documents.noTemplate")}</option>}{options.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.origin === "standard" ? t("templates.standard") : template.filename}</option>)}</select><Button size="small" disabled={!selected || generating !== null} onClick={() => void startGeneration(type)}>{generating === type ? t("documents.generating") : t("documents.generateWord")}</Button></article>; })}</div>
    <GeneratedDocumentHistory projectId={project.id} t={t} />
    <Modal open={Boolean(pending)} title={t("documents.missingTitle")} onClose={() => setPending(null)}><div className="modal-body"><p>{t("documents.missingText")}</p><ul className="missing-placeholder-list">{pending?.missing.map((placeholder) => <li key={placeholder}><code>{`{{${placeholder}}}`}</code></li>)}</ul><p>{t("documents.missingChoice")}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setPending(null)}>{t("documents.returnToProject")}</Button><Button onClick={() => void proceedWithMissing()}>{t("documents.proceedEmpty")}</Button></div></Modal>
  </div>;
}

function AssetPreview({ asset }: { asset: ProjectAsset }) {
  const [url, setUrl] = useState(asset.previewDataUrl ?? asset.dataUrl);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void blobObjectUrl(asset.previewBlobId ?? (asset.mimeType.startsWith("image/") ? asset.blobId : undefined), asset.previewDataUrl ?? asset.dataUrl).then((next) => {
      if (!active) { if (next?.startsWith("blob:")) URL.revokeObjectURL(next); return; }
      objectUrl = next; setUrl(next);
    });
    return () => { active = false; if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl); };
  }, [asset]);
  return url ? <img src={url} alt="" /> : <FileText size={22} />;
}

function GeneratedDocumentHistory({ projectId, t }: { projectId: string; t: (key: string, params?: Record<string, string | number>) => string }) {
  const { database } = useApp();
  const generated = database.generatedDocuments.filter((document) => document.projectId === projectId);
  const download = async (blobId: string, filename: string) => {
    const blob = await getBlob(blobId); if (!blob) return;
    const { downloadBlob } = await import("../documents/templateEngine"); downloadBlob(blob, filename);
  };
  if (!generated.length) return null;
  return <section className="panel generated-history"><div className="panel-header"><h2>{t("documents.generatedHistory")}</h2></div><div className="panel-body revision-list">{generated.map((document) => <article className="revision-item" key={document.id}><span className="document-card-icon"><FileText size={18} /></span><span><strong>{document.filename}</strong><span>{new Date(document.generatedAt).toLocaleString()}</span><span>{document.stale ? t("documents.stale") : t("documents.current")}</span></span><Button size="small" variant="secondary" onClick={() => void download(document.blobId, document.filename)}><Download size={14} />{t("common.download")}</Button></article>)}</div></section>;
}
