import { Download } from "lucide-react";
import { useState } from "react";
import type { PreparedWordDocument } from "../documents/projectWordDocument";
import type { DocumentTemplate } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { Button, Modal } from "./Ui";

export function WordDocumentCreationDialog({ template, onClose, onCreated }: {
  template: DocumentTemplate;
  onClose: () => void;
  onCreated: (filename: string) => void;
}) {
  const { database, getProject } = useApp();
  const { t } = useI18n();
  const [projectId, setProjectId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<PreparedWordDocument | null>(null);
  const [error, setError] = useState("");
  const projects = database.projects.filter((project) => project.status !== "archived");

  const createDocument = async () => {
    const project = getProject(projectId);
    if (!project) return;
    setGenerating(true);
    setError("");
    try {
      const { prepareProjectWordDocument, renderPreparedWordDocument } = await import("../documents/projectWordDocument");
      const document = pendingDocument ?? await prepareProjectWordDocument(database, project, template);
      if (document.inspection.unsafeCommands.length) {
        setError(t("documents.unsafeTemplate", { commands: document.inspection.unsafeCommands.join(", ") }));
        return;
      }
      if (!pendingDocument && document.inspection.missingPlaceholders.length) {
        setPendingDocument(document);
        return;
      }
      const blob = await renderPreparedWordDocument(document);
      const { downloadBlob } = await import("../documents/templateEngine");
      downloadBlob(blob, document.filename);
      onCreated(document.filename);
    } catch (generationError) {
      setError(generationError instanceof Error && generationError.message === "template_file_missing"
        ? t("documents.templateFileMissing") : t("documents.generationFailed"));
    } finally { setGenerating(false); }
  };

  return <Modal open title={pendingDocument ? t("documents.missingTitle") : t("templates.createDocument")} onClose={() => { if (!generating) onClose(); }}>
    <div className="modal-body template-form">
      <p><strong>{template.origin === "standard" ? t(`documents.${template.documentType}`) : template.name}</strong></p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {pendingDocument ? <>
        <p>{t("documents.missingText")}</p>
        <ul className="missing-placeholder-list">{pendingDocument.inspection.missingPlaceholders.map((path) => <li key={path}><code>{`{{${path}}}`}</code></li>)}</ul>
        <p>{t("templates.unknownChoice")}</p>
      </> : <>
        <label className="field"><span>{t("templates.selectProject")}</span><select aria-label={t("templates.selectProject")} value={projectId} disabled={generating} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">{t("templates.chooseProject")}</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {projects.length === 0 && <p>{t("templates.noProjects")}</p>}
      </>}
    </div>
    <div className="modal-footer">
      <Button variant="secondary" disabled={generating} onClick={onClose}>{t("common.cancel")}</Button>
      <Button disabled={!projectId || generating} onClick={() => void createDocument()}><Download size={15} />{generating ? t("documents.generating") : pendingDocument ? t("documents.proceedEmpty") : t("templates.createDocument")}</Button>
    </div>
  </Modal>;
}
