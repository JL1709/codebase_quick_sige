import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { z } from "zod";
import type { AppUser, Organization, OrganizationProfile } from "./types";

export const MAX_ORGANIZATION_NAME_LENGTH = 160;
export const MAX_ORGANIZATION_FIELD_LENGTH = 200;
export const MAX_ORGANIZATION_EMAIL_LENGTH = 254;
export const MAX_ORGANIZATION_WEBSITE_LENGTH = 2048;
export const MAX_ORGANIZATION_PHONE_LENGTH = 60;
export const MAX_PHONE_EXTENSION_LENGTH = 10;
export const ORGANIZATION_COUNTRIES = getCountries();
const supportedCountries = new Set<string>(ORGANIZATION_COUNTRIES);
const addressField = z.string().max(MAX_ORGANIZATION_FIELD_LENGTH);

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(1).max(MAX_ORGANIZATION_NAME_LENGTH),
  address: z.object({
    street: addressField,
    houseNumber: addressField,
    addressAddition: addressField,
    postalCode: addressField,
    city: addressField,
    region: addressField,
    countryCode: z.string().refine((value) => !value || supportedCountries.has(value)),
  }),
  phone: z.string().max(MAX_ORGANIZATION_PHONE_LENGTH),
  phoneExtension: z.string().max(MAX_PHONE_EXTENSION_LENGTH),
  mobilePhone: z.string().max(MAX_ORGANIZATION_PHONE_LENGTH),
  fax: z.string().max(MAX_ORGANIZATION_PHONE_LENGTH),
  faxExtension: z.string().max(MAX_PHONE_EXTENSION_LENGTH),
  email: z.string().max(MAX_ORGANIZATION_EMAIL_LENGTH),
  website: z.string().max(MAX_ORGANIZATION_WEBSITE_LENGTH),
  logo: z.object({
    blobId: z.string().min(1),
    filename: z.string().min(1).max(MAX_ORGANIZATION_FIELD_LENGTH),
    mimeType: z.enum(["image/png", "image/jpeg"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
});

export const storedOrganizationSchema = organizationProfileSchema.extend({ id: z.string().min(1), accentColor: z.string() });
export type OrganizationProfileErrors = Record<string, "required" | "length" | "country" | "email" | "website" | "phone" | "extension" | "logo">;

export function emptyOrganizationProfile(name = ""): OrganizationProfile {
  return {
    name,
    address: { street: "", houseNumber: "", addressAddition: "", postalCode: "", city: "", region: "", countryCode: "" },
    phone: "", phoneExtension: "", mobilePhone: "", fax: "", faxExtension: "", email: "", website: "",
  };
}

export function canManageOrganization(user: AppUser): boolean {
  return user.role === "owner" || user.role === "admin";
}

export function validateOrganizationProfile(input: OrganizationProfile):
  | { valid: true; profile: OrganizationProfile }
  | { valid: false; errors: OrganizationProfileErrors } {
  const profile: OrganizationProfile = {
    ...input,
    name: input.name.trim(),
    address: Object.fromEntries(Object.entries(input.address).map(([key, value]) => [key, value.trim()])) as OrganizationProfile["address"],
    phone: input.phone.trim(), phoneExtension: input.phoneExtension.trim(), mobilePhone: input.mobilePhone.trim(),
    fax: input.fax.trim(), faxExtension: input.faxExtension.trim(), email: input.email.trim(), website: input.website.trim(),
  };
  const errors: OrganizationProfileErrors = {};
  const parsed = organizationProfileSchema.safeParse(profile);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      errors[field.startsWith("logo") ? "logo" : field] = field === "name" && !profile.name ? "required"
        : field === "address.countryCode" ? "country" : field.startsWith("logo") ? "logo" : "length";
    }
  }
  if (profile.email && !z.email().safeParse(profile.email).success) errors.email = "email";
  if (profile.website) {
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(profile.website) ? profile.website : `https://${profile.website}`);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /\s/.test(profile.website)) errors.website = "website";
      else profile.website = url.href;
    } catch { errors.website = "website"; }
  }
  for (const field of ["phone", "mobilePhone", "fax"] as const) {
    const extensionField = field === "phone" ? "phoneExtension" : field === "fax" ? "faxExtension" : undefined;
    const extension = extensionField ? profile[extensionField] : "";
    if (extensionField && extension && (!/^\d+$/.test(extension) || !profile[field])) errors[extensionField] = "extension";
    if (!profile[field]) continue;
    const phone = parsePhoneNumberFromString(profile[field], {
      defaultCountry: supportedCountries.has(profile.address.countryCode) ? profile.address.countryCode as CountryCode : undefined,
      extract: false,
    });
    if (!phone?.isValid() || (phone.ext && (!extensionField || (extension && extension !== phone.ext)))) {
      errors[field] = "phone";
      continue;
    }
    profile[field] = phone.number;
    if (extensionField && phone.ext) {
      if (phone.ext.length > MAX_PHONE_EXTENSION_LENGTH) errors[extensionField] = "extension";
      else profile[extensionField] = phone.ext;
    }
  }
  const normalized = organizationProfileSchema.safeParse(profile);
  if (!normalized.success) {
    for (const issue of normalized.error.issues) {
      const field = issue.path.join(".");
      if (!errors[field]) errors[field] = field.startsWith("logo") ? "logo" : "length";
    }
  }
  return Object.keys(errors).length || !normalized.success ? { valid: false, errors } : { valid: true, profile: normalized.data };
}

export function organizationAddressLines(organization?: Organization): string[] {
  if (!organization) return [];
  const address = organization.address;
  return [
    [address.street, address.houseNumber].filter(Boolean).join(" "),
    address.addressAddition,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.region,
    address.countryCode,
  ].filter(Boolean);
}
