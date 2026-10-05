import type { OrganizationLogo } from "../domain/types";

export const EXAMPLE_ORGANIZATION_LOGO_URL = new URL("../assets/example-organization-logo.png", import.meta.url).href;

export const EXAMPLE_ORGANIZATION_LOGO: OrganizationLogo = {
  blobId: "example-organization-logo-quickreports-v1",
  filename: "quickreports-logo.png",
  mimeType: "image/png",
  width: 1024,
  height: 1024,
};
