import { describe, expect, it } from "vitest";
import { emptyOrganizationProfile, validateOrganizationProfile } from "./organizationProfile";

describe("organization profiles", () => {
  it("requires only a trimmed organization name", () => {
    expect(validateOrganizationProfile(emptyOrganizationProfile("  Example GmbH  "))).toEqual({ valid: true, profile: emptyOrganizationProfile("Example GmbH") });
    expect(validateOrganizationProfile(emptyOrganizationProfile("  "))).toMatchObject({ valid: false, errors: { name: "required" } });
  });

  it("preserves postal codes, alphanumeric house numbers, and independent contact details", () => {
    const profile = emptyOrganizationProfile("Example");
    profile.address = { ...profile.address, postalCode: " 01234 ", houseNumber: " 12a ", countryCode: "DE" };
    profile.email = "office@example.test";
    expect(validateOrganizationProfile(profile)).toMatchObject({ valid: true, profile: { address: { postalCode: "01234", houseNumber: "12a" }, email: "office@example.test" } });
  });

  it("normalizes local landline, mobile, and fax numbers using the selected country", () => {
    const profile = emptyOrganizationProfile("Example");
    profile.address.countryCode = "DE";
    profile.phone = "030 123456";
    profile.mobilePhone = "0151 23456789";
    profile.fax = "030 654321";
    expect(validateOrganizationProfile(profile)).toMatchObject({ valid: true, profile: { phone: "+4930123456", mobilePhone: "+4915123456789", fax: "+4930654321" } });
  });

  it("supports international numbers without an address country and separates extensions", () => {
    const profile = { ...emptyOrganizationProfile("Example"), phone: "+44 20 7946 0018 ext. 42", fax: "+1 213 373 4253", faxExtension: "003" };
    expect(validateOrganizationProfile(profile)).toMatchObject({ valid: true, profile: { phone: "+442079460018", phoneExtension: "42", fax: "+12133734253", faxExtension: "003" } });
  });

  it("rejects malformed numbers and extensions instead of guessing", () => {
    const profile = { ...emptyOrganizationProfile("Example"), phone: "call me at +44 20 7946 0018", mobilePhone: "123", faxExtension: "42" };
    expect(validateOrganizationProfile(profile)).toMatchObject({ valid: false, errors: { phone: "phone", mobilePhone: "phone", faxExtension: "extension" } });
    expect(validateOrganizationProfile({ ...profile, phone: "+44 20 7946 0018 ext. 42", phoneExtension: "43" })).toMatchObject({ valid: false, errors: { phone: "phone" } });
  });

  it("does not assume Germany when a national number has no country", () => {
    expect(validateOrganizationProfile({ ...emptyOrganizationProfile("Example"), phone: "030 123456" })).toMatchObject({ valid: false, errors: { phone: "phone" } });
  });

  it("normalizes website domains and rejects executable URLs and credentials", () => {
    expect(validateOrganizationProfile({ ...emptyOrganizationProfile("Example"), website: "example.com" })).toMatchObject({ valid: true, profile: { website: "https://example.com/" } });
    for (const website of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.com", "not a website"]) {
      expect(validateOrganizationProfile({ ...emptyOrganizationProfile("Example"), website })).toMatchObject({ valid: false, errors: { website: "website" } });
    }
  });

  it("rejects invalid email, country, and overlong profile values", () => {
    const profile = { ...emptyOrganizationProfile("Example"), email: "bad-email", website: "a".repeat(2048), address: { ...emptyOrganizationProfile().address, street: "a".repeat(201), countryCode: "ZZ" } };
    expect(validateOrganizationProfile(profile)).toMatchObject({ valid: false, errors: { email: "email", "address.street": "length", "address.countryCode": "country", website: "length" } });
  });

  it("strips identity and other fields outside the editable profile", () => {
    const profile = { ...emptyOrganizationProfile("Example"), id: "another-tenant", accentColor: "red" };
    const result = validateOrganizationProfile(profile);
    expect(result.valid && result.profile).not.toHaveProperty("id");
    expect(result.valid && result.profile).not.toHaveProperty("accentColor");
  });
});
