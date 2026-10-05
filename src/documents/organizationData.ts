import { blobDataUrl } from "../data/blobRepository";
import type { Organization } from "../domain/types";

export type OrganizationDocumentProfile = Organization & { logoDataUrl?: string };

export async function hydrateOrganizationLogo(organization?: Organization): Promise<OrganizationDocumentProfile | undefined> {
  if (!organization) return undefined;
  const logoDataUrl = organization.logo ? await blobDataUrl(organization.logo.blobId) : undefined;
  if (organization.logo && !logoDataUrl) throw new Error("Organization logo file is missing.");
  return { ...organization, logoDataUrl };
}
