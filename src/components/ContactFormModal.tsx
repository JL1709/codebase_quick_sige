import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { companyForContact, contactDisplayName, normalizeDomain, normalizeEmail, normalizePhone } from "../domain/contacts";
import type { Company, Contact, ContactAddress, ContactEmail, ContactMethodType, ContactPhone } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { Button, Modal } from "./Ui";

const EMPTY_ADDRESS: Omit<ContactAddress, "id"> = {
  type: "work", street: "", postalCode: "", city: "", region: "", country: "", primary: true,
};

function methodTypeOptions(t: (key: string) => string) {
  return (["work", "mobile", "home", "other"] as ContactMethodType[]).map((type) => <option key={type} value={type}>{t(`contacts.method.${type}`)}</option>);
}

export function ContactFormModal({ open, contact, projectParticipantContext = false, onClose, onSaved }: { open: boolean; contact?: Contact; projectParticipantContext?: boolean; onClose: () => void; onSaved?: (contact: Contact) => void }) {
  const { database, saveContact, saveCompany, saveContactAffiliation } = useApp();
  const { t } = useI18n();
  const affiliation = useMemo(() => contact && database.contactAffiliations.find((candidate) => candidate.contactId === contact.id && candidate.primary), [contact, database.contactAffiliations]);
  const company = contact ? companyForContact(database, contact.id) : undefined;
  const [prefix, setPrefix] = useState(contact?.prefix ?? "");
  const [givenName, setGivenName] = useState(contact?.givenName ?? "");
  const [familyName, setFamilyName] = useState(contact?.familyName ?? "");
  const [suffix, setSuffix] = useState(contact?.suffix ?? "");
  const [emails, setEmails] = useState<Array<Pick<ContactEmail, "id" | "type" | "value" | "primary">>>(
    contact?.emails.map(({ id, type, value, primary }) => ({ id, type, value, primary })) ?? [{ id: newId("email"), type: "work", value: "", primary: true }],
  );
  const [phones, setPhones] = useState<Array<Pick<ContactPhone, "id" | "type" | "value" | "primary">>>(
    contact?.phones.map(({ id, type, value, primary }) => ({ id, type, value, primary })) ?? [{ id: newId("phone"), type: "work", value: "", primary: true }],
  );
  const [addresses, setAddresses] = useState<ContactAddress[]>(
    contact?.addresses.length ? contact.addresses : [{ id: newId("address"), ...EMPTY_ADDRESS }],
  );
  const [companyName, setCompanyName] = useState(company?.name ?? "");
  const [jobTitle, setJobTitle] = useState(affiliation?.jobTitle ?? "");
  const [department, setDepartment] = useState(affiliation?.department ?? "");
  const [tags, setTags] = useState(contact?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [submitted, setSubmitted] = useState(false);

  const updateEmail = (id: string, patch: Partial<(typeof emails)[number]>) => setEmails((current) => current.map((email) => email.id === id ? { ...email, ...patch } : email));
  const updatePhone = (id: string, patch: Partial<(typeof phones)[number]>) => setPhones((current) => current.map((phone) => phone.id === id ? { ...phone, ...patch } : phone));
  const validName = Boolean(givenName.trim() || familyName.trim());
  const emailInvalid = emails.some((email) => email.value.trim() && !/^[^\s@]+@[^\s@]+$/.test(email.value.trim()));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!validName || emailInvalid) return;
    const now = new Date().toISOString();
    const contactId = contact?.id ?? newId("contact");
    const savedContact: Contact = {
      id: contactId,
      organizationId: database.organization.id,
      prefix: prefix.trim(), givenName: givenName.trim(), familyName: familyName.trim(), suffix: suffix.trim(),
      emails: emails.filter((email) => email.value.trim()).map((email, index) => ({ ...email, value: email.value.trim(), normalizedValue: normalizeEmail(email.value), primary: emails.some((candidate) => candidate.primary && candidate.value.trim()) ? email.primary : index === 0 })),
      phones: phones.filter((phone) => phone.value.trim()).map((phone, index) => ({ ...phone, value: phone.value.trim(), normalizedValue: normalizePhone(phone.value), primary: phones.some((candidate) => candidate.primary && candidate.value.trim()) ? phone.primary : index === 0 })),
      addresses: ensureAddressPrimary(addresses.filter((candidate) => [candidate.street, candidate.postalCode, candidate.city, candidate.region, candidate.country].some((value) => value.trim()))),
      notes: notes.trim(), tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
      lifecycle: contact?.lifecycle ?? "active", source: contact?.source ?? "manual",
      createdAt: contact?.createdAt ?? now, updatedAt: now,
    };
    saveContact(savedContact);

    if (companyName.trim()) {
      const existingCompany = database.companies.find((candidate) => candidate.name.trim().toLocaleLowerCase() === companyName.trim().toLocaleLowerCase());
      const savedCompany: Company = existingCompany ?? {
        id: newId("company"), organizationId: database.organization.id, name: companyName.trim(), website: "", domain: normalizeDomain(""), email: "", phone: "",
        notes: "", tags: [], lifecycle: "active", source: "manual", createdAt: now, updatedAt: now,
      };
      if (!existingCompany) saveCompany(savedCompany);
      saveContactAffiliation({
        id: affiliation?.id ?? newId("affiliation"), organizationId: database.organization.id,
        contactId, companyId: savedCompany.id, jobTitle: jobTitle.trim(), department: department.trim(),
        primary: true, lifecycle: "active", createdAt: affiliation?.createdAt ?? now, updatedAt: now,
      });
    } else if (affiliation) saveContactAffiliation({ ...affiliation, primary: false, lifecycle: "archived", updatedAt: now });
    onSaved?.(savedContact);
    onClose();
  };

  return <Modal open={open} title={t(contact ? "contacts.editContact" : "contacts.newContact")} onClose={onClose} className="contact-form-modal">
    <form onSubmit={handleSubmit}>
      <div className="modal-body contact-form-body">
        <div className="form-grid contact-name-grid">
          <label className="field"><span>{t("contacts.prefix")}</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
          <label className="field"><span>{t("contacts.givenName")}</span><input autoFocus aria-invalid={submitted && !validName} value={givenName} onChange={(event) => setGivenName(event.target.value)} /></label>
          <label className="field"><span>{t("contacts.familyName")}</span><input aria-invalid={submitted && !validName} value={familyName} onChange={(event) => setFamilyName(event.target.value)} /></label>
          <label className="field"><span>{t("contacts.suffix")}</span><input value={suffix} onChange={(event) => setSuffix(event.target.value)} /></label>
          {submitted && !validName && <small className="field-error contact-name-error">{t("contacts.nameRequired")}</small>}
        </div>

        <MethodEditor title={t("contacts.emails")} primaryLabel={t("contacts.primary")} removeLabel={t("common.remove")} values={emails} invalid={emailInvalid} addLabel={t("contacts.addEmail")} onAdd={() => setEmails((current) => [...current, { id: newId("email"), type: "work", value: "", primary: current.length === 0 }])} onUpdate={updateEmail} onRemove={(id) => setEmails((current) => current.filter((value) => value.id !== id))} onPrimary={(id) => setEmails((current) => current.map((value) => ({ ...value, primary: value.id === id })))} typeOptions={methodTypeOptions(t)} />
        <MethodEditor title={t("contacts.phones")} primaryLabel={t("contacts.primary")} removeLabel={t("common.remove")} values={phones} addLabel={t("contacts.addPhone")} onAdd={() => setPhones((current) => [...current, { id: newId("phone"), type: "work", value: "", primary: current.length === 0 }])} onUpdate={updatePhone} onRemove={(id) => setPhones((current) => current.filter((value) => value.id !== id))} onPrimary={(id) => setPhones((current) => current.map((value) => ({ ...value, primary: value.id === id })))} typeOptions={methodTypeOptions(t)} />

        <fieldset className="contact-fieldset"><legend>{t("contacts.company")}</legend><div className="form-grid">
          <label className="field"><span>{t("contacts.companyName")}</span><input list="contact-companies" value={companyName} onChange={(event) => setCompanyName(event.target.value)} /><datalist id="contact-companies">{database.companies.filter((candidate) => candidate.lifecycle === "active").map((candidate) => <option key={candidate.id} value={candidate.name} />)}</datalist></label>
          <label className="field"><span>{t("contacts.jobTitle")}</span><input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label>
          <label className="field span-two"><span>{t("contacts.department")}</span><input value={department} onChange={(event) => setDepartment(event.target.value)} /></label>
        </div></fieldset>

        <fieldset className="contact-fieldset"><legend>{t("contacts.address")}</legend><div className="contact-address-list">
          {addresses.map((address, index) => <div className="contact-address-card" key={address.id}>
            <div className="contact-address-toolbar">
              <select aria-label={`${t("contacts.address")} ${index + 1}`} value={address.type} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, type: event.target.value as ContactMethodType } : candidate))}>
                {(["work", "home", "other"] as ContactMethodType[]).map((type) => <option key={type} value={type}>{t(`contacts.method.${type}`)}</option>)}
              </select>
              <label className="primary-choice"><input type="radio" name="primary-address" checked={address.primary} onChange={() => setAddresses((current) => current.map((candidate) => ({ ...candidate, primary: candidate.id === address.id })))} />{t("contacts.primary")}</label>
              <button type="button" className="icon-button danger-icon" onClick={() => setAddresses((current) => current.filter((candidate) => candidate.id !== address.id))} aria-label={t("common.remove")}><Trash2 size={14} /></button>
            </div>
            <div className="form-grid">
              <label className="field span-two"><span>{t("contacts.street")}</span><input value={address.street} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, street: event.target.value } : candidate))} /></label>
              <label className="field"><span>{t("contacts.postalCode")}</span><input value={address.postalCode} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, postalCode: event.target.value } : candidate))} /></label>
              <label className="field"><span>{t("contacts.city")}</span><input value={address.city} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, city: event.target.value } : candidate))} /></label>
              <label className="field"><span>{t("contacts.region")}</span><input value={address.region} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, region: event.target.value } : candidate))} /></label>
              <label className="field"><span>{t("contacts.country")}</span><input value={address.country} onChange={(event) => setAddresses((current) => current.map((candidate) => candidate.id === address.id ? { ...candidate, country: event.target.value } : candidate))} /></label>
            </div>
          </div>)}
          <Button type="button" variant="ghost" size="small" onClick={() => setAddresses((current) => [...current, { id: newId("address"), ...EMPTY_ADDRESS, primary: current.length === 0 }])}><Plus size={14} />{t("contacts.addAddress")}</Button>
        </div></fieldset>

        <label className="field"><span>{t("contacts.tags")}</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("contacts.tagsPlaceholder")} /></label>
        <label className="field"><span>{t("contacts.notes")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {contact && <p className="field-help">{t("contacts.editing", { name: contactDisplayName(contact) })}</p>}
        {projectParticipantContext && !contact && <div className="contact-catalog-notice"><CircleCheck size={18} aria-hidden="true" /><span><strong>{t("contacts.savedToContacts")}</strong><small>{t("contacts.savedToContactsHelp")}</small></span></div>}
      </div>
      <div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div>
    </form>
  </Modal>;
}

function ensureAddressPrimary(addresses: ContactAddress[]): ContactAddress[] {
  if (addresses.length === 0 || addresses.some((address) => address.primary)) return addresses;
  return addresses.map((address, index) => ({ ...address, primary: index === 0 }));
}

function MethodEditor<T extends { id: string; type: ContactMethodType; value: string; primary: boolean }>({ title, primaryLabel, removeLabel, values, invalid, addLabel, onAdd, onUpdate, onRemove, onPrimary, typeOptions }: {
  title: string;
  primaryLabel: string;
  removeLabel: string;
  values: T[];
  invalid?: boolean;
  addLabel: string;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<T>) => void;
  onRemove: (id: string) => void;
  onPrimary: (id: string) => void;
  typeOptions: React.ReactNode;
}) {
  return <fieldset className="contact-fieldset"><legend>{title}</legend><div className="contact-method-list">
    {values.map((value) => <div className="contact-method-row" key={value.id}>
      <select aria-label={`${title} type`} value={value.type} onChange={(event) => onUpdate(value.id, { type: event.target.value as ContactMethodType } as Partial<T>)}>{typeOptions}</select>
      <input aria-label={title} aria-invalid={invalid || undefined} value={value.value} onChange={(event) => onUpdate(value.id, { value: event.target.value } as Partial<T>)} />
      <label className="primary-choice"><input type="radio" name={`primary-${title}`} checked={value.primary} onChange={() => onPrimary(value.id)} />{primaryLabel}</label>
      <button type="button" className="icon-button danger-icon" onClick={() => onRemove(value.id)} aria-label={removeLabel}><Trash2 size={14} /></button>
    </div>)}
    <Button type="button" variant="ghost" size="small" onClick={onAdd}><Plus size={14} />{addLabel}</Button>
  </div></fieldset>;
}

export function CompanyFormModal({ open, company, onClose }: { open: boolean; company?: Company; onClose: () => void }) {
  const { database, saveCompany } = useApp();
  const { t } = useI18n();
  const [name, setName] = useState(company?.name ?? "");
  const [website, setWebsite] = useState(company?.website ?? "");
  const [email, setEmail] = useState(company?.email ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [address, setAddress] = useState<ContactAddress>(company?.address ?? { id: newId("address"), ...EMPTY_ADDRESS });
  const [tags, setTags] = useState(company?.tags.join(", ") ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [submitted, setSubmitted] = useState(false);
  const websiteIsSafe = !website.trim() || /^https?:\/\//i.test(website.trim());
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !websiteIsSafe) return;
    const now = new Date().toISOString();
    saveCompany({
      id: company?.id ?? newId("company"), organizationId: database.organization.id, name: name.trim(), website: website.trim(),
      domain: normalizeDomain(website), email: email.trim(), phone: phone.trim(), notes: notes.trim(),
      address: [address.street, address.postalCode, address.city, address.region, address.country].some((value) => value.trim()) ? address : undefined,
      tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))], lifecycle: company?.lifecycle ?? "active",
      source: company?.source ?? "manual", createdAt: company?.createdAt ?? now, updatedAt: now,
    });
    onClose();
  };
  return <Modal open={open} title={t(company ? "contacts.editCompany" : "contacts.newCompany")} onClose={onClose}>
    <form onSubmit={handleSubmit}><div className="modal-body form-grid">
      <label className="field span-two"><span>{t("contacts.companyName")}</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="field span-two"><span>{t("contacts.website")}</span><input type="url" aria-invalid={submitted && !websiteIsSafe} value={website} onChange={(event) => setWebsite(event.target.value)} />{submitted && !websiteIsSafe && <small className="field-error">{t("contacts.websiteInvalid")}</small>}</label>
      <label className="field"><span>{t("contacts.email")}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="field"><span>{t("contacts.phone")}</span><input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <fieldset className="contact-fieldset span-two"><legend>{t("contacts.address")}</legend><div className="form-grid">
        <label className="field span-two"><span>{t("contacts.street")}</span><input value={address.street} onChange={(event) => setAddress((current) => ({ ...current, street: event.target.value }))} /></label>
        <label className="field"><span>{t("contacts.postalCode")}</span><input value={address.postalCode} onChange={(event) => setAddress((current) => ({ ...current, postalCode: event.target.value }))} /></label>
        <label className="field"><span>{t("contacts.city")}</span><input value={address.city} onChange={(event) => setAddress((current) => ({ ...current, city: event.target.value }))} /></label>
        <label className="field"><span>{t("contacts.region")}</span><input value={address.region} onChange={(event) => setAddress((current) => ({ ...current, region: event.target.value }))} /></label>
        <label className="field"><span>{t("contacts.country")}</span><input value={address.country} onChange={(event) => setAddress((current) => ({ ...current, country: event.target.value }))} /></label>
      </div></fieldset>
      <label className="field span-two"><span>{t("contacts.tags")}</span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
      <label className="field span-two"><span>{t("contacts.notes")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    </div><div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div></form>
  </Modal>;
}
