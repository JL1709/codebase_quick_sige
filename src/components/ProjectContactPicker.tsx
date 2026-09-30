import { Plus, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { companyForContact, contactDisplayName, primaryAffiliation, primaryEmail, primaryPhone } from "../domain/contacts";
import type { AppDatabase, Contact } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { Button } from "./Ui";

const MAX_VISIBLE_CONTACT_RESULTS = 8;

interface ProjectContactPickerProps {
  excludedContactIds: string[];
  onSelect: (contactId: string) => void;
  onCreateContact?: () => void;
}

export function ProjectContactPicker({ excludedContactIds, onSelect, onCreateContact }: ProjectContactPickerProps) {
  const { database } = useApp();
  const { t } = useI18n();
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const excludedIds = useMemo(() => new Set(excludedContactIds), [excludedContactIds]);
  const availableContacts = useMemo(() => database.contacts
    .filter((contact) => contact.lifecycle === "active" && !excludedIds.has(contact.id))
    .sort((left, right) => contactDisplayName(left).localeCompare(contactDisplayName(right))), [database.contacts, excludedIds]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => availableContacts.filter((contact) => (
    !normalizedQuery || contactSearchText(database, contact).includes(normalizedQuery)
  )).slice(0, MAX_VISIBLE_CONTACT_RESULTS), [availableContacts, database, normalizedQuery]);

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  const selectContact = (contactId: string) => {
    onSelect(contactId);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (results.length === 0) return;
      setHighlightedIndex((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (results.length === 0) return;
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && results[highlightedIndex]) {
      event.preventDefault();
      selectContact(results[highlightedIndex].id);
    }
  };

  return <div className="field project-contact-picker" ref={rootRef}>
    <label className="field-label" htmlFor={`${pickerId}-input`}>{t("contacts.addPerson")}</label>
    <div className="project-contact-picker-input">
      <Search size={15} />
      <input
        ref={inputRef}
        id={`${pickerId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${pickerId}-results`}
        aria-activedescendant={open && results[highlightedIndex] ? `${pickerId}-option-${results[highlightedIndex].id}` : undefined}
        value={query}
        placeholder={t("contacts.projectSearchPlaceholder")}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setHighlightedIndex(0); setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
    </div>
    {open && <div className="project-contact-picker-popover">
      <div id={`${pickerId}-results`} className="project-contact-picker-results" role="listbox" aria-label={t("contacts.availableContacts")}>
        {results.map((contact, index) => {
          const company = companyForContact(database, contact.id);
          const affiliation = primaryAffiliation(database, contact.id);
          const secondaryDetails = [company?.name, affiliation?.jobTitle, primaryEmail(contact)?.value, primaryPhone(contact)?.value].filter(Boolean);
          return <button
            type="button"
            role="option"
            id={`${pickerId}-option-${contact.id}`}
            aria-selected={index === highlightedIndex}
            className={index === highlightedIndex ? "is-highlighted" : ""}
            key={contact.id}
            onMouseEnter={() => setHighlightedIndex(index)}
            onClick={() => selectContact(contact.id)}
          >
            <span className="participant-avatar">{contactDisplayName(contact).slice(0, 1).toUpperCase()}</span>
            <span><strong>{contactDisplayName(contact)}</strong><small>{secondaryDetails.join(" · ")}</small></span>
          </button>;
        })}
        {results.length === 0 && <p>{availableContacts.length === 0 ? t("contacts.noAvailableContacts") : t("contacts.noContactMatches")}</p>}
      </div>
      {onCreateContact && <div className="project-contact-picker-footer"><Button type="button" size="small" variant="ghost" onClick={() => { setOpen(false); onCreateContact(); }}><Plus size={14} />{t("contacts.newContact")}</Button></div>}
    </div>}
  </div>;
}

function contactSearchText(database: AppDatabase, contact: Contact): string {
  const affiliations = database.contactAffiliations.filter((affiliation) => affiliation.contactId === contact.id && affiliation.lifecycle === "active");
  const companies = affiliations.flatMap((affiliation) => {
    const company = database.companies.find((candidate) => candidate.id === affiliation.companyId);
    return [company?.name, affiliation.jobTitle, affiliation.department];
  });
  return [
    contactDisplayName(contact),
    contact.prefix,
    contact.givenName,
    contact.familyName,
    ...contact.emails.map((email) => email.value),
    ...contact.phones.map((phone) => phone.value),
    ...companies,
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}
