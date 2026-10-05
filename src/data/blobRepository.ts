import { openDB, type DBSchema } from "idb";
import { EXAMPLE_ORGANIZATION_LOGO, EXAMPLE_ORGANIZATION_LOGO_URL } from "./exampleOrganizationLogo";
import { bundledWordTemplateUrl } from "./bundledWordTemplates";

interface StoredBlob { bytes: ArrayBuffer; type: string }

interface QuickSiGeBlobDatabase extends DBSchema {
  blobs: { key: string; value: StoredBlob | Blob };
}

const DATABASE_NAME = "quicksige-files";
const STORE_NAME = "blobs";

async function database() {
  return openDB<QuickSiGeBlobDatabase>(DATABASE_NAME, 1, {
    upgrade(store) { if (!store.objectStoreNames.contains(STORE_NAME)) store.createObjectStore(STORE_NAME); },
  });
}

export interface BlobRepository {
  save(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
}

/** Adapter boundary kept intentionally small so Supabase Storage can replace IndexedDB later. */
export class IndexedDbBlobRepository implements BlobRepository {
  async save(id: string, blob: Blob): Promise<void> { await saveBlob(id, blob); }
  async get(id: string): Promise<Blob | undefined> { return getBlob(id); }
  async delete(id: string): Promise<void> { await deleteBlob(id); }
}

export const localBlobRepository: BlobRepository = new IndexedDbBlobRepository();

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const store = await database();
  const storedBlob: StoredBlob = { bytes: await blob.arrayBuffer(), type: blob.type };
  await store.put(STORE_NAME, storedBlob, id);
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const templateUrl = bundledWordTemplateUrl(id);
  if (templateUrl) {
    const response = await fetch(templateUrl);
    return response.ok ? response.blob() : undefined;
  }
  // The bundled example stays available after a reset and in published snapshots.
  if (id === EXAMPLE_ORGANIZATION_LOGO.blobId) {
    const response = await fetch(EXAMPLE_ORGANIZATION_LOGO_URL);
    return response.ok ? response.blob() : undefined;
  }
  const store = await database();
  const storedBlob = await store.get(STORE_NAME, id);
  if (!storedBlob) return undefined;
  if (storedBlob instanceof Blob) return storedBlob;
  return new Blob([storedBlob.bytes], { type: storedBlob.type });
}

export async function deleteBlob(id: string): Promise<void> {
  const store = await database();
  await store.delete(STORE_NAME, id);
}

export async function blobObjectUrl(blobId?: string, legacyDataUrl?: string): Promise<string | undefined> {
  if (blobId === EXAMPLE_ORGANIZATION_LOGO.blobId) return EXAMPLE_ORGANIZATION_LOGO_URL;
  if (!blobId) return legacyDataUrl;
  const blob = await getBlob(blobId);
  return blob ? URL.createObjectURL(blob) : legacyDataUrl;
}

export async function blobDataUrl(blobId?: string, legacyDataUrl?: string): Promise<string | undefined> {
  let blob = blobId ? await getBlob(blobId) : undefined;
  // Bundled project images use local URLs; image placeholders need their bytes.
  if (!blob && legacyDataUrl?.startsWith("/") && new URL(legacyDataUrl, window.location.origin).origin === window.location.origin) {
    const response = await fetch(legacyDataUrl);
    if (response.ok) blob = await response.blob();
  }
  if (!blob) return legacyDataUrl;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unexpected blob result"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
