import type { BuildingBlock } from "./types";

const SEEDED_IMAGE_BY_BLOCK_ID: Record<string, string> = {
  "block-existing-utilities": "block-existing-utilities.png",
  "block-site-fencing": "block-site-fencing.png",
  "block-site-access": "block-site-access.png",
  "block-first-aid": "block-first-aid.png",
  "block-emergency-information": "block-emergency-information.png",
  "block-temporary-power": "block-temporary-power.png",
  "block-traffic-routes": "block-traffic-routes.png",
  "block-excavation": "block-excavation.png",
  "block-fall-protection": "block-fall-protection.png",
  "block-scaffolding": "block-scaffolding.png",
  "block-lifting": "block-lifting.png",
  "block-live-operations": "block-live-operations.png",
  "block-hot-works": "block-hot-works.png",
  "block-hazardous-substances": "block-hazardous-substances.png",
  "block-confined-spaces": "block-confined-spaces.png",
  "block-demolition": "block-demolition.png",
  "block-heat-uv": "block-heat-uv.png",
  "block-winter": "block-winter.png",
  "import-existing-utilities": "import-existing-utilities.png",
  "import-site-distribution": "import-site-distribution.png",
  "import-small-distribution": "import-small-distribution.png",
  "import-portable-fence": "import-portable-fence.png",
  "organization-delivery-check-in": "organization-delivery-check-in.png",
};

export function defaultBlockImageSource(blockId: string): string | undefined {
  const filename = SEEDED_IMAGE_BY_BLOCK_ID[blockId];
  return filename ? `/block-images/${filename}` : undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the block image."));
    reader.readAsDataURL(blob);
  });
}

async function loadImageSource(source: string | undefined): Promise<string | undefined> {
  if (!source || source.startsWith("data:")) return source;
  if (!source.startsWith("/block-images/")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not load block image: ${source}`);
  return blobToDataUrl(await response.blob());
}

export async function hydrateBlockImages(blocks: BuildingBlock[]): Promise<BuildingBlock[]> {
  return Promise.all(blocks.map(async (block) => ({
    ...block,
    imageDataUrl: await loadImageSource(block.imageDataUrl),
  })));
}
