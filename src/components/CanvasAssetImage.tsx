import { FileOutput, Image } from "lucide-react";
import { useEffect, useState } from "react";
import { blobObjectUrl, getBlob } from "../data/blobRepository";
import { createPdfPageRenderer, DEFAULT_PREVIEW_WIDTH } from "../documents/pdfPreview";
import { pdfPreviewCache } from "../documents/pdfPreviewCache";
import type { ProjectAsset } from "../domain/types";

interface CanvasAssetImageProps {
  asset: ProjectAsset;
  pdfPage: boolean;
  pageNumber?: number;
  fitMode?: "contain" | "cover";
  crop?: { x: number; y: number; width: number; height: number };
  previewWidth?: number;
  t: (key: string) => string;
}

export function CanvasAssetImage({ asset, pdfPage, pageNumber = 1, fitMode, crop, previewWidth = DEFAULT_PREVIEW_WIDTH, t }: CanvasAssetImageProps) {
  const { id, createdAt, blobId, dataUrl, previewBlobId, previewDataUrl } = asset;
  const source = JSON.stringify([id, createdAt, blobId, dataUrl]);
  const identity = JSON.stringify([source, pdfPage, pageNumber, previewWidth, previewBlobId, previewDataUrl]);
  const [resolved, setResolved] = useState<{ identity: string; url: string | undefined; failed?: boolean }>();
  const cachedUrl = pdfPage
    ? pdfPreviewCache.get(source, pageNumber, previewWidth) ?? (pageNumber === 1 ? previewDataUrl : undefined)
    : dataUrl;
  const url = resolved?.identity === identity ? resolved.url : cachedUrl;
  const failed = resolved?.identity === identity && resolved.failed;

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const resolvePreview = async () => {
      if (!pdfPage) return blobObjectUrl(blobId, dataUrl);
      if (pageNumber === 1 && (previewBlobId || previewDataUrl)) {
        const cover = await blobObjectUrl(previewBlobId, previewDataUrl);
        if (cover) return cover;
      }
      return pdfPreviewCache.render(source, pageNumber, previewWidth, async () => {
        let blob = blobId ? await getBlob(blobId) : undefined;
        if (!blob && dataUrl) {
          const response = await fetch(dataUrl);
          if (!response.ok) throw new Error("PDF source could not be loaded");
          blob = await response.blob();
        }
        if (!blob) throw new Error("PDF source is missing");
        return createPdfPageRenderer(blob);
      });
    };
    void resolvePreview().then((next) => {
      if (next?.startsWith("blob:")) objectUrl = next;
      if (active) setResolved({ identity, url: next });
      else if (objectUrl) URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setResolved({ identity, url: undefined, failed: true });
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId, dataUrl, identity, pageNumber, pdfPage, previewBlobId, previewDataUrl, previewWidth, source]);

  return url
    ? <img src={url} alt={asset.filename} style={{ objectFit: fitMode ?? "contain", objectPosition: `${crop?.x ?? 50}% ${crop?.y ?? 50}%` }} />
    : <div className="pdf-page-placeholder" aria-busy={!failed}>
      {pdfPage ? <FileOutput size={28} /> : <Image size={28} />}
      <strong>{asset.filename}</strong>
      {pdfPage && <span>PDF · {t("editor.page")} {pageNumber}</span>}
      {failed && <span>{t("editor.previewUnavailable")}</span>}
    </div>;
}
