import {
  CheckCircle2, Download, FileImage, FileSpreadsheet, FileText, Folder, FolderPlus, Pencil, Trash2, Upload,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Modal } from "../components/Ui";
import { blobObjectUrl, deleteBlob, getBlob, saveBlob } from "../data/blobRepository";
import { inspectPdf } from "../documents/pdfPreview";
import {
  hasValidProjectAssetSignature,
  isValidProjectAssetFilename,
  MAX_PROJECT_ASSET_TOTAL_BYTES,
  projectAssetTypeLabel,
  sanitizeAssetFilename,
  validateProjectAsset,
} from "../domain/projectAssets";
import type { ProjectAsset, ProjectDocumentFolder } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

const PROJECT_FILE_ACCEPT = [
  ".png", ".jpg", ".jpeg", ".pdf", ".docx", ".xlsx",
  "image/png", "image/jpeg", "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

type FolderSelection = "all" | "unfiled" | string;

function normalizedFolderName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isPlanAsset(asset: ProjectAsset): boolean {
  return asset.mimeType.startsWith("image/") || asset.mimeType === "application/pdf";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function DocumentsPage() {
  const { projectId = "" } = useParams();
  const { getProject, getPlanForProject, updateProject, updatePlan } = useApp();
  const { locale, t } = useI18n();
  const project = getProject(projectId);
  const plan = getPlanForProject(projectId);
  const [activeFolderId, setActiveFolderId] = useState<FolderSelection>("all");
  const [assetMessage, setAssetMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ProjectDocumentFolder | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<ProjectDocumentFolder | null>(null);
  const [assetToEdit, setAssetToEdit] = useState<ProjectAsset | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetFolderId, setAssetFolderId] = useState("");
  const [assetToDelete, setAssetToDelete] = useState<ProjectAsset | null>(null);

  if (!project) return <NotFoundPage />;

  const folders = project.documentFolders;
  const visibleAssets = project.assets.filter((asset) => {
    if (activeFolderId === "all") return true;
    if (activeFolderId === "unfiled") return !asset.folderId;
    return asset.folderId === activeFolderId;
  });
  const folderNameConflict = folders.some((folder) => (
    folder.id !== editingFolder?.id && normalizedFolderName(folder.name) === normalizedFolderName(folderName)
  ));
  const assetNameValid = assetToEdit ? isValidProjectAssetFilename(assetName, assetToEdit.mimeType) : true;

  const openUpload = () => {
    setUploadFile(null);
    setUploadFolderId(activeFolderId !== "all" && activeFolderId !== "unfiled" ? activeFolderId : "");
    setUploadOpen(true);
  };
  const uploadAsset = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadFile) return;
    const validation = validateProjectAsset(uploadFile);
    if (!validation.valid) {
      setAssetMessage({ tone: "danger", text: t(`documents.assetError.${validation.reason}`) });
      return;
    }
    const currentBytes = project.assets.reduce((total, asset) => total + asset.byteSize, 0);
    if (currentBytes + uploadFile.size > MAX_PROJECT_ASSET_TOTAL_BYTES) {
      setAssetMessage({ tone: "danger", text: t("documents.assetError.storage") });
      return;
    }
    setUploading(true);
    try {
      if (!await hasValidProjectAssetSignature(uploadFile, validation.mimeType)) {
        setAssetMessage({ tone: "danger", text: t("documents.assetError.type") });
        return;
      }
      const blobId = newId("asset-blob");
      await saveBlob(blobId, uploadFile);
      const pdfInspection = validation.mimeType === "application/pdf" ? await inspectPdf(uploadFile) : undefined;
      let previewBlobId: string | undefined;
      if (pdfInspection?.previewDataUrl) {
        previewBlobId = newId("asset-preview");
        await saveBlob(previewBlobId, await (await fetch(pdfInspection.previewDataUrl)).blob());
      }
      const asset: ProjectAsset = {
        id: newId("asset"),
        filename: validation.filename,
        mimeType: validation.mimeType,
        byteSize: uploadFile.size,
        folderId: uploadFolderId || undefined,
        blobId,
        previewBlobId,
        pageCount: pdfInspection?.pageCount,
        createdAt: new Date().toISOString(),
      };
      updateProject({ ...project, assets: [asset, ...project.assets] });
      setAssetMessage({ tone: "success", text: t("documents.assetAdded", { name: asset.filename }) });
      setUploadOpen(false);
      setUploadFile(null);
    } catch {
      setAssetMessage({ tone: "danger", text: t("documents.assetError.read") });
    } finally {
      setUploading(false);
    }
  };
  const downloadAsset = async (asset: ProjectAsset) => {
    const blob = asset.blobId
      ? await getBlob(asset.blobId)
      : asset.dataUrl ? await (await fetch(asset.dataUrl)).blob() : undefined;
    if (!blob) {
      setAssetMessage({ tone: "danger", text: t("documents.fileUnavailable") });
      return;
    }
    triggerDownload(blob, asset.filename);
  };
  const openFolderModal = (folder?: ProjectDocumentFolder) => {
    setEditingFolder(folder ?? null);
    setFolderName(folder?.name ?? "");
    setFolderModalOpen(true);
  };
  const saveFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || folderNameConflict) return;
    const nextFolder: ProjectDocumentFolder = editingFolder
      ? { ...editingFolder, name }
      : { id: newId("document-folder"), name, createdAt: new Date().toISOString() };
    const documentFolders = editingFolder
      ? folders.map((folder) => folder.id === editingFolder.id ? nextFolder : folder)
      : [...folders, nextFolder];
    updateProject({ ...project, documentFolders });
    setFolderModalOpen(false);
  };
  const deleteFolder = () => {
    if (!folderToDelete) return;
    updateProject({
      ...project,
      documentFolders: folders.filter((folder) => folder.id !== folderToDelete.id),
      assets: project.assets.map((asset) => asset.folderId === folderToDelete.id ? { ...asset, folderId: undefined } : asset),
    });
    if (activeFolderId === folderToDelete.id) setActiveFolderId("unfiled");
    setFolderToDelete(null);
  };
  const openAssetEditor = (asset: ProjectAsset) => {
    setAssetToEdit(asset);
    setAssetName(asset.filename);
    setAssetFolderId(asset.folderId ?? "");
  };
  const saveAsset = (event: FormEvent) => {
    event.preventDefault();
    if (!assetToEdit || !assetNameValid) return;
    const filename = sanitizeAssetFilename(assetName);
    updateProject({
      ...project,
      assets: project.assets.map((asset) => asset.id === assetToEdit.id
        ? { ...asset, filename, folderId: assetFolderId || undefined }
        : asset),
    });
    setAssetToEdit(null);
  };
  const deleteAsset = async () => {
    if (!assetToDelete) return;
    try {
      await Promise.all([assetToDelete.blobId, assetToDelete.previewBlobId]
        .filter((blobId): blobId is string => Boolean(blobId))
        .map((blobId) => deleteBlob(blobId)));
      updateProject({ ...project, assets: project.assets.filter((asset) => asset.id !== assetToDelete.id) });
      if (plan && (plan.includedAssetIds.includes(assetToDelete.id) || plan.layout.elements.some((element) => (
        (element.kind === "image" || element.kind === "pdf_page") && element.assetId === assetToDelete.id
      )))) {
        updatePlan({
          ...plan,
          includedAssetIds: plan.includedAssetIds.filter((assetId) => assetId !== assetToDelete.id),
          layout: {
            ...plan.layout,
            elements: plan.layout.elements.filter((element) => !(
              (element.kind === "image" || element.kind === "pdf_page") && element.assetId === assetToDelete.id
            )),
          },
        });
      }
      setAssetMessage({ tone: "success", text: t("documents.fileDeleted", { name: assetToDelete.filename }) });
      setAssetToDelete(null);
    } catch {
      setAssetMessage({ tone: "danger", text: t("documents.fileDeleteFailed") });
    }
  };

  return <div className="workspace-page">
    <section className="overview-heading">
      <div><h1>{t("documents.title")}</h1><p>{t("documents.subtitle")}</p></div>
      <Button onClick={openUpload}><Upload size={15} />{t("documents.uploadAsset")}</Button>
    </section>
    {assetMessage && <div className={`asset-message is-${assetMessage.tone}`} role={assetMessage.tone === "danger" ? "alert" : "status"}>{assetMessage.tone === "success" && <CheckCircle2 size={15} />}{assetMessage.text}</div>}
    <div className="document-library">
      <aside className="panel document-folders">
        <div className="document-folders-header"><h2>{t("documents.folders")}</h2><button className="icon-button" onClick={() => openFolderModal()} aria-label={t("documents.addFolder")}><FolderPlus size={16} /></button></div>
        <nav aria-label={t("documents.folders")}>
          <button className={activeFolderId === "all" ? "is-active" : ""} onClick={() => setActiveFolderId("all")}><Folder size={15} /><span>{t("documents.allFiles")}</span><small>{project.assets.length}</small></button>
          <button className={activeFolderId === "unfiled" ? "is-active" : ""} onClick={() => setActiveFolderId("unfiled")}><Folder size={15} /><span>{t("documents.unfiled")}</span><small>{project.assets.filter((asset) => !asset.folderId).length}</small></button>
          {folders.map((folder) => <div className={`document-folder-row ${activeFolderId === folder.id ? "is-active" : ""}`} key={folder.id}>
            <button onClick={() => setActiveFolderId(folder.id)}><Folder size={15} /><span>{folder.name}</span><small>{project.assets.filter((asset) => asset.folderId === folder.id).length}</small></button>
            <span className="document-folder-actions"><button className="icon-button" onClick={() => openFolderModal(folder)} aria-label={`${t("common.edit")}: ${folder.name}`}><Pencil size={13} /></button><button className="icon-button danger-icon" onClick={() => setFolderToDelete(folder)} aria-label={`${t("common.delete")}: ${folder.name}`}><Trash2 size={13} /></button></span>
          </div>)}
        </nav>
      </aside>
      <section className="panel document-files">
        <div className="panel-header"><div><h2>{activeFolderId === "all" ? t("documents.allFiles") : activeFolderId === "unfiled" ? t("documents.unfiled") : folders.find((folder) => folder.id === activeFolderId)?.name}</h2><p>{t("documents.fileCount", { count: visibleAssets.length })}</p></div></div>
        <div className="panel-body">
          {visibleAssets.length === 0 ? <div className="document-empty"><Folder size={24} /><strong>{t("documents.noFilesInFolder")}</strong><span>{t("documents.noFilesInFolderText")}</span><Button size="small" onClick={openUpload}><Upload size={14} />{t("documents.uploadAsset")}</Button></div> : <div className="asset-list">{visibleAssets.map((asset) => <article className="asset-row" key={asset.id}>
            <span className="asset-preview"><AssetPreview asset={asset} /></span>
            <span className="asset-details"><strong>{asset.filename}</strong><small>{projectAssetTypeLabel(asset.mimeType)} · {new Intl.NumberFormat(locale).format(Math.max(1, Math.ceil(asset.byteSize / 1024)))} KB · {new Date(asset.createdAt).toLocaleDateString(locale)}</small>{isPlanAsset(asset) && <em>{t("documents.availableInPlan")}</em>}</span>
            <span className="asset-folder-label">{folders.find((folder) => folder.id === asset.folderId)?.name ?? t("documents.unfiled")}</span>
            <span className="row-actions"><Button size="small" variant="secondary" onClick={() => void downloadAsset(asset)}><Download size={14} />{t("common.download")}</Button><button className="icon-button" onClick={() => openAssetEditor(asset)} aria-label={`${t("common.edit")}: ${asset.filename}`}><Pencil size={14} /></button><button className="icon-button danger-icon" onClick={() => setAssetToDelete(asset)} aria-label={`${t("common.delete")}: ${asset.filename}`}><Trash2 size={14} /></button></span>
          </article>)}</div>}
        </div>
      </section>
    </div>

    <Modal open={uploadOpen} title={t("documents.uploadTitle")} onClose={() => setUploadOpen(false)}><form onSubmit={(event) => void uploadAsset(event)}><div className="modal-body form-grid"><label className="field span-two"><span>{t("documents.chooseFile")}</span><input required type="file" accept={PROJECT_FILE_ACCEPT} onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} /><small>{t("documents.supportedFiles")}</small></label><label className="field span-two"><span>{t("documents.folder")}</span><select value={uploadFolderId} onChange={(event) => setUploadFolderId(event.target.value)}><option value="">{t("documents.unfiled")}</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={!uploadFile || uploading}>{uploading ? t("documents.uploading") : t("documents.uploadAsset")}</Button></div></form></Modal>

    <Modal open={folderModalOpen} title={editingFolder ? t("documents.renameFolder") : t("documents.addFolder")} onClose={() => setFolderModalOpen(false)}><form onSubmit={saveFolder}><div className="modal-body"><label className="field"><span>{t("documents.folderName")}</span><input autoFocus required value={folderName} onChange={(event) => setFolderName(event.target.value)} />{folderNameConflict && <small className="field-error" role="alert">{t("documents.folderNameUnique")}</small>}</label></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setFolderModalOpen(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={!folderName.trim() || folderNameConflict}>{t("common.save")}</Button></div></form></Modal>

    <Modal open={Boolean(folderToDelete)} title={t("documents.deleteFolderTitle")} onClose={() => setFolderToDelete(null)}><div className="modal-body"><p>{t("documents.deleteFolderText", { name: folderToDelete?.name ?? "" })}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setFolderToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={deleteFolder}>{t("common.delete")}</Button></div></Modal>

    <Modal open={Boolean(assetToEdit)} title={t("documents.editFile")} onClose={() => setAssetToEdit(null)}><form onSubmit={saveAsset}><div className="modal-body form-grid"><label className="field span-two"><span>{t("documents.fileName")}</span><input required value={assetName} onChange={(event) => setAssetName(event.target.value)} />{!assetNameValid && <small className="field-error" role="alert">{t("documents.fileNameType")}</small>}</label><label className="field span-two"><span>{t("documents.folder")}</span><select value={assetFolderId} onChange={(event) => setAssetFolderId(event.target.value)}><option value="">{t("documents.unfiled")}</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setAssetToEdit(null)}>{t("common.cancel")}</Button><Button type="submit" disabled={!assetNameValid}>{t("common.save")}</Button></div></form></Modal>

    <Modal open={Boolean(assetToDelete)} title={t("documents.deleteFileTitle")} onClose={() => setAssetToDelete(null)}><div className="modal-body"><p>{t("documents.deleteFileText", { name: assetToDelete?.filename ?? "" })}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setAssetToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => void deleteAsset()}>{t("common.delete")}</Button></div></Modal>
  </div>;
}

function AssetPreview({ asset }: { asset: ProjectAsset }) {
  const [url, setUrl] = useState(asset.previewDataUrl ?? (asset.mimeType.startsWith("image/") ? asset.dataUrl : undefined));
  useEffect(() => {
    if (!isPlanAsset(asset)) return undefined;
    let active = true;
    let objectUrl: string | undefined;
    void blobObjectUrl(
      asset.mimeType === "application/pdf" ? asset.previewBlobId : asset.blobId,
      asset.mimeType === "application/pdf" ? asset.previewDataUrl : asset.dataUrl,
    ).then((next) => {
      if (!active) { if (next?.startsWith("blob:")) URL.revokeObjectURL(next); return; }
      objectUrl = next;
      setUrl(next);
    });
    return () => { active = false; if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl); };
  }, [asset]);
  if (url) return <img src={url} alt="" />;
  if (asset.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return <FileSpreadsheet size={22} />;
  if (asset.mimeType.startsWith("image/")) return <FileImage size={22} />;
  return <FileText size={22} />;
}
