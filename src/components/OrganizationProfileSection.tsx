import { Building2, ImagePlus, Save, Trash2 } from "lucide-react";
import { type ChangeEvent, type FormEvent, type InputHTMLAttributes, useEffect, useMemo, useRef, useState } from "react";
import { blobObjectUrl, deleteBlob, saveBlob } from "../data/blobRepository";
import { ORGANIZATION_LOGO_ACCEPT, prepareOrganizationLogo } from "../domain/organizationLogo";
import {
  canManageOrganization, MAX_ORGANIZATION_EMAIL_LENGTH, MAX_ORGANIZATION_FIELD_LENGTH,
  MAX_ORGANIZATION_NAME_LENGTH, MAX_ORGANIZATION_WEBSITE_LENGTH,
  MAX_PHONE_EXTENSION_LENGTH, ORGANIZATION_COUNTRIES, organizationProfileSchema,
  validateOrganizationProfile, type OrganizationProfileErrors,
} from "../domain/organizationProfile";
import type { Organization, OrganizationProfile } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { Button } from "./Ui";
import { PhoneNumberField } from "./PhoneNumberField";

export function OrganizationProfileSection() {
  const { database, saveOrganizationProfile } = useApp();
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const canEdit = canManageOrganization(database.user) && database.user.organizationId === database.organization.id;

  return <section className="panel settings-card organization-profile" aria-labelledby="organization-profile-title">
    <div className="organization-profile-heading">
      <span className="stat-icon"><Building2 size={18} /></span>
      <div><h2 id="organization-profile-title">{t("settings.organization")}</h2><p>{t("organization.description")}</p></div>
    </div>
    <OrganizationProfileForm
      key={JSON.stringify(database.organization)}
      organization={database.organization}
      canEdit={canEdit}
      onSave={(profile) => { saveOrganizationProfile(profile); setSaved(true); }}
      onChange={() => setSaved(false)}
    />
    {saved && <p className="organization-save-status" role="status">{t("organization.saved")}</p>}
  </section>;
}

function OrganizationProfileForm({ organization, canEdit, onSave, onChange }: {
  organization: Organization;
  canEdit: boolean;
  onSave: (profile: OrganizationProfile) => void;
  onChange: () => void;
}) {
  const { locale, t } = useI18n();
  const initialProfile = useMemo(() => organizationProfileSchema.parse(organization), [organization]);
  const [draft, setDraft] = useState<OrganizationProfile>(() => structuredClone(initialProfile));
  const [errors, setErrors] = useState<OrganizationProfileErrors>({});
  const [saveError, setSaveError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [loadingLogo, setLoadingLogo] = useState(false);
  const [phoneInputResetVersion, setPhoneInputResetVersion] = useState(0);
  const [logoPreview, setLogoPreview] = useState<{ blobId: string; url: string } | null>(null);
  const pendingBlobIds = useRef(new Set<string>());
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialProfile);
  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return ORGANIZATION_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((left, right) => left.name.localeCompare(right.name, locale));
  }, [locale]);

  const discardPendingLogos = () => {
    for (const blobId of pendingBlobIds.current) void deleteBlob(blobId).catch(() => undefined);
    pendingBlobIds.current.clear();
  };
  useEffect(() => {
    const pending = pendingBlobIds.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const blobId of pending) void deleteBlob(blobId).catch(() => undefined);
      pending.clear();
    };
  }, []);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const blobId = draft.logo?.blobId;
    if (blobId) {
      void blobObjectUrl(blobId).then((url) => {
        objectUrl = url;
        if (active && url) setLogoPreview({ blobId, url });
        else if (active) setLogoError(true);
        else if (url) URL.revokeObjectURL(url);
      }).catch(() => { if (active) setLogoError(true); });
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [draft.logo?.blobId]);

  const updateDraft = (next: OrganizationProfile, field: string) => {
    setDraft(next);
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)));
    setSaveError(false);
    onChange();
  };
  const selectLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;
    setLoadingLogo(true);
    setLogoError(false);
    try {
      const prepared = await prepareOrganizationLogo(file);
      if (!mounted.current) return;
      const blobId = newId("organization-logo");
      await saveBlob(blobId, file);
      if (!mounted.current) { await deleteBlob(blobId); return; }
      pendingBlobIds.current.add(blobId);
      const { filename, mimeType, width, height } = prepared;
      setDraft((current) => ({ ...current, logo: { filename, mimeType, width, height, blobId } }));
      setSaveError(false);
      onChange();
    } catch { if (mounted.current) setLogoError(true); }
    finally { if (mounted.current) setLoadingLogo(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || loadingLogo) return;
    const validation = validateOrganizationProfile(draft);
    if (!validation.valid) {
      setErrors(validation.errors);
      const firstField = Object.keys(validation.errors)[0];
      (form.current?.elements.namedItem(firstField) as HTMLElement | null)?.focus();
      return;
    }
    try {
      onSave(validation.profile);
      // Published revisions can still refer to earlier logos; only abandoned draft uploads are removed.
      if (validation.profile.logo) pendingBlobIds.current.delete(validation.profile.logo.blobId);
      discardPendingLogos();
    } catch { setSaveError(true); }
  };
  const cancel = () => {
    discardPendingLogos();
    setDraft(structuredClone(initialProfile));
    setErrors({}); setSaveError(false); setLogoError(false);
    setPhoneInputResetVersion((version) => version + 1);
    onChange();
  };
  const field = (name: Exclude<keyof OrganizationProfile, "address" | "logo">, options: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "name" | "value"> = {}) => (
    <ProfileField name={name} value={draft[name]} error={errors[name]} disabled={!canEdit || loadingLogo}
      onChange={(value) => updateDraft({ ...draft, [name]: value }, name)} {...options} />
  );
  const addressField = (name: Exclude<keyof OrganizationProfile["address"], "countryCode">, options: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "name" | "value"> = {}) => (
    <ProfileField name={`address.${name}`} value={draft.address[name]} error={errors[`address.${name}`]} disabled={!canEdit || loadingLogo}
      onChange={(value) => updateDraft({ ...draft, address: { ...draft.address, [name]: value } }, `address.${name}`)} {...options} />
  );
  const preview = logoPreview?.blobId === draft.logo?.blobId ? logoPreview?.url : undefined;
  const phoneField = (name: "phone" | "mobilePhone" | "fax") => (
    <PhoneNumberField key={`${name}-${phoneInputResetVersion}`} name={name} label={t(`organization.${name}`)} value={draft[name]} defaultCountry={draft.address.countryCode}
      disabled={!canEdit || loadingLogo} error={errors[name]} onChange={(value) => updateDraft({ ...draft, [name]: value }, name)} />
  );

  return <form ref={form} className="organization-profile-form" onSubmit={submit} noValidate>
    <p className="organization-form-note">{t(canEdit ? "organization.optionalFields" : "organization.readOnly")}</p>
    <div className="organization-profile-grid">
      <fieldset className="organization-field-group"><legend>{t("organization.identity")}</legend>
        {field("name", { required: true, maxLength: MAX_ORGANIZATION_NAME_LENGTH, autoComplete: "organization" })}
        <div className="organization-logo-field">
          <span className="field-label">{t("organization.logo")}</span>
          <div className="organization-logo-preview">{preview ? <img src={preview} alt={t("organization.logoAlt", { name: draft.name })} /> : <ImagePlus size={30} aria-hidden="true" />}</div>
          {draft.logo && <small className="organization-logo-filename">{draft.logo.filename}</small>}
          {canEdit && <><input ref={fileInput} type="file" accept={ORGANIZATION_LOGO_ACCEPT} aria-label={t("organization.logoUpload")} className="organization-logo-input" onChange={(event) => void selectLogo(event)} disabled={loadingLogo} />
            <div className="row-actions"><Button type="button" variant="secondary" size="small" disabled={loadingLogo} onClick={() => fileInput.current?.click()}><ImagePlus size={14} />{t(draft.logo ? "organization.replaceLogo" : "organization.uploadLogo")}</Button>
              {draft.logo && <Button type="button" variant="ghost" size="small" disabled={loadingLogo} onClick={() => { updateDraft({ ...draft, logo: undefined }, "logo"); setLogoError(false); }}><Trash2 size={14} />{t("organization.removeLogo")}</Button>}</div>
            <small className="field-help">{t("organization.logoHelp")}</small></>}
          {loadingLogo && <small role="status">{t("organization.logoLoading")}</small>}
          {(logoError || errors.logo) && <small className="field-error" role="alert">{t("organization.error.logo")}</small>}
        </div>
      </fieldset>
      <fieldset className="organization-field-group"><legend>{t("organization.address")}</legend>
        <div className="organization-street-row">{addressField("street", { autoComplete: "address-line1" })}{addressField("houseNumber")}</div>
        {addressField("addressAddition", { autoComplete: "address-line2" })}
        <div className="organization-postal-row">{addressField("postalCode", { autoComplete: "postal-code" })}{addressField("city", { autoComplete: "address-level2" })}</div>
        {addressField("region", { autoComplete: "address-level1" })}
        <label className="field"><span id="organization-country-label">{t("organization.address.countryCode")}</span>
          <select name="address.countryCode" autoComplete="country" aria-labelledby="organization-country-label" value={draft.address.countryCode} disabled={!canEdit || loadingLogo} aria-invalid={Boolean(errors["address.countryCode"])}
            onChange={(event) => updateDraft({ ...draft, address: { ...draft.address, countryCode: event.target.value } }, "address.countryCode")}>
            <option value="">{t("organization.selectCountry")}</option>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
          {errors["address.countryCode"] && <small className="field-error" role="alert">{t("organization.error.country")}</small>}
        </label>
      </fieldset>
      <fieldset className="organization-field-group"><legend>{t("organization.contact")}</legend>
        <div className="organization-phone-row">{phoneField("phone")}{field("phoneExtension", { inputMode: "numeric", maxLength: MAX_PHONE_EXTENSION_LENGTH })}</div>
        {phoneField("mobilePhone")}
        <div className="organization-phone-row">{phoneField("fax")}{field("faxExtension", { inputMode: "numeric", maxLength: MAX_PHONE_EXTENSION_LENGTH })}</div>
        {field("email", { type: "email", autoComplete: "email", maxLength: MAX_ORGANIZATION_EMAIL_LENGTH })}
        {field("website", { inputMode: "url", autoComplete: "url", maxLength: MAX_ORGANIZATION_WEBSITE_LENGTH, placeholder: "https://example.com" })}
      </fieldset>
    </div>
    {saveError && <p className="form-error" role="alert">{t("organization.saveFailed")}</p>}
    {canEdit && <div className="organization-form-actions"><Button type="button" variant="secondary" onClick={cancel} disabled={!dirty || loadingLogo}>{t("common.cancel")}</Button><Button type="submit" disabled={!dirty || loadingLogo}><Save size={15} />{t("common.save")}</Button></div>}
  </form>;
}

function ProfileField({ name, value, error, onChange, ...options }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "name" | "value"> & {
  name: string;
  value: string;
  error?: OrganizationProfileErrors[string];
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const errorId = `organization-${name}-error`;
  return <label className="field"><span>{t(`organization.${name}`)}{options.required && <span aria-hidden="true"> *</span>}</span>
    <input name={name} value={value} maxLength={MAX_ORGANIZATION_FIELD_LENGTH} {...options} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
    {error && <small id={errorId} className="field-error" role="alert">{t(`organization.error.${error}`)}</small>}
  </label>;
}
