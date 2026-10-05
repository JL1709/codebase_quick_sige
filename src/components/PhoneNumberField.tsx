import { ChevronDown, Globe2, Search } from "lucide-react";
import { AsYouType, getCountryCallingCode, isSupportedCountry, parseDigits, type CountryCode } from "libphonenumber-js/max";
import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MAX_ORGANIZATION_PHONE_LENGTH, ORGANIZATION_COUNTRIES, type OrganizationProfileErrors } from "../domain/organizationProfile";
import { useI18n } from "../i18n/I18nProvider";

interface PhoneNumberFieldProps {
  name: string;
  label: string;
  value: string;
  defaultCountry?: string;
  disabled?: boolean;
  error?: OrganizationProfileErrors[string];
  onChange: (value: string) => void;
}

export function PhoneNumberField({ name, label, value, defaultCountry, disabled, error, onChange }: PhoneNumberFieldProps) {
  const { locale, t } = useI18n();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const numberInput = useRef<HTMLInputElement>(null);
  const [countrySelection, setCountrySelection] = useState<{ country?: CountryCode } | null>(null);
  const formatter = new AsYouType();
  formatter.input(value);
  const supportedDefaultCountry = defaultCountry && isSupportedCountry(defaultCountry) ? defaultCountry as CountryCode : undefined;
  const defaultMatchesNumber = supportedDefaultCountry && formatter.getCallingCode() === getCountryCallingCode(supportedDefaultCountry);
  const inferredCountry = formatter.getCountry() ?? (!value || defaultMatchesNumber ? supportedDefaultCountry : undefined);
  const country = countrySelection ? countrySelection.country : inferredCountry;
  const options = useMemo(() => {
    const countryNames = new Intl.DisplayNames([locale], { type: "region" });
    return [{ label: t("organization.international") }, ...ORGANIZATION_COUNTRIES.map((country) => ({ value: country, label: countryNames.of(country) ?? country }))];
  }, [locale, t]);

  const pendingCaret = useRef<number | null>(null);
  const displayValue = formatPhoneInputValue(value, country);
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && document.activeElement === numberInput.current) {
      numberInput.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const selectCountry = (nextCountry?: CountryCode) => {
    const nationalNumber = formatter.getNumber()?.nationalNumber;
    const nextParser = new AsYouType();
    nextParser.input(nextCountry && nationalNumber ? `+${getCountryCallingCode(nextCountry)}${nationalNumber}` : value);
    setCountrySelection({ country: nextCountry ? nextParser.getCountry() ?? nextCountry : undefined });
    if (nextCountry) onChange(nationalNumber ? nextParser.getNumberValue() ?? "" : "");
    numberInput.current?.focus();
  };
  const changeNumber = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget.value;
    const international = input.trim().startsWith("+");
    const parser = new AsYouType(international ? undefined : country);
    parser.input(!country && !international && input ? `+${input}` : input);
    const parsedCountry = parser.getCountry();
    const nextCountry = international ? parsedCountry : parsedCountry ?? country;
    if (international || nextCountry !== country) setCountrySelection({ country: nextCountry });
    // National prefixes are interpreted by country metadata, including countries where a leading zero belongs to the number.
    const nextValue = parser.getNumber()?.nationalNumber ? parser.getNumberValue() ?? ""
      : parsedCountry ? "" : parser.getChars();
    const formatted = formatPhoneInputValue(nextValue, nextCountry);
    const removedPrefixDigits = Math.max(0, parseDigits(input).length - parseDigits(formatted).length);
    const digitsBeforeCaret = Math.max(0, parseDigits(input.slice(0, event.currentTarget.selectionStart ?? input.length)).length - removedPrefixDigits);
    pendingCaret.current = caretAfterDigits(formatted, digitsBeforeCaret);
    onChange(nextValue);
  };

  return <div className="field phone-number-field">
    <label className="field-label" htmlFor={inputId}>{label}</label>
    <div className="phone-number-control">
      <CountryCallingCodeSelect value={country} onChange={selectCountry} options={options} fieldLabel={label} disabled={disabled} />
      <input
        ref={numberInput}
        id={inputId}
        name={name}
        type="tel"
        className="phone-number-input"
        value={displayValue}
        onChange={changeNumber}
        disabled={disabled}
        maxLength={MAX_ORGANIZATION_PHONE_LENGTH}
        autoComplete="tel-national"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
    </div>
    {error && <small id={errorId} className="field-error" role="alert">{t(`organization.error.${error}`)}</small>}
  </div>;
}

function formatPhoneInputValue(value: string, country?: CountryCode): string {
  const formatter = new AsYouType();
  const formatted = formatter.input(value);
  const prefix = country ? `+${getCountryCallingCode(country)}` : "";
  return prefix && formatted.startsWith(prefix) ? formatted.slice(prefix.length).trimStart() : formatted;
}

function caretAfterDigits(value: string, digitCount: number): number {
  if (!digitCount) return value.startsWith("+") ? 1 : 0;
  let remainingDigits = digitCount;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index]) && --remainingDigits === 0) return index + 1;
  }
  return value.length;
}

interface CountryOption { value?: CountryCode; label: string }
interface CountryCallingCodeSelectProps {
  value?: CountryCode;
  onChange: (country?: CountryCode) => void;
  options: CountryOption[];
  fieldLabel: string;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const REGIONAL_INDICATOR_START = 0x1f1e6;
const ASCII_UPPERCASE_A = 0x41;

function countryFlag(country: CountryCode): string {
  return [...country].map((letter) => String.fromCodePoint(REGIONAL_INDICATOR_START + letter.charCodeAt(0) - ASCII_UPPERCASE_A)).join("");
}

function CountryCallingCodeSelect({ value, onChange, options, fieldLabel, disabled, readOnly, onFocus, onBlur }: CountryCallingCodeSelectProps) {
  const { locale, t } = useI18n();
  const pickerId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const countryLabel = t("organization.phoneCountry", { field: fieldLabel });
  const callingCode = value ? `+${getCountryCallingCode(value)}` : "+";
  const selectedLabel = options.find((option) => option.value === value)?.label ?? t("organization.selectCountry");
  const sortedOptions = useMemo(() => [...options].sort((left, right) => (
    !left.value ? -1 : !right.value ? 1 : left.label.localeCompare(right.label, locale)
  )), [options, locale]);
  const search = query.trim().toLocaleLowerCase(locale);
  const results = sortedOptions.filter((option) => (
    !search || `${option.label} ${option.value ?? ""} ${option.value ? `+${getCountryCallingCode(option.value)}` : ""}`.toLocaleLowerCase(locale).includes(search)
  ));
  const activeIndex = Math.min(highlightedIndex, Math.max(0, results.length - 1));
  const activeId = results[activeIndex] ? `${pickerId}-option-${results[activeIndex].value ?? "international"}` : undefined;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  const selectCountry = (country?: CountryCode) => {
    onChange(country);
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex(Math.max(0, Math.min(activeIndex + direction, results.length - 1)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[activeIndex]) selectCountry(results[activeIndex].value);
    }
  };

  return <div className="phone-country-selector" ref={root}
    onFocus={(event) => { if (!root.current?.contains(event.relatedTarget as Node)) onFocus?.(); }}
    onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node)) { setOpen(false); onBlur?.(); } }}>
    <button ref={trigger} type="button" className="phone-country-trigger" disabled={disabled || readOnly}
      aria-label={`${countryLabel}: ${selectedLabel} (${callingCode})`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${pickerId}-popup`}
      title={`${selectedLabel} (${callingCode})`}
      onClick={() => { setOpen(!open); setQuery(""); setHighlightedIndex(Math.max(0, sortedOptions.findIndex((option) => option.value === value))); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setQuery(""); setHighlightedIndex(0); } }}>
      <span aria-hidden="true" className="phone-country-flag">{value ? countryFlag(value) : <Globe2 size={17} />}</span>
      <span>{callingCode}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div id={`${pickerId}-popup`} className="phone-country-popover" role="dialog" aria-label={countryLabel}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}>
      <div className="phone-country-search"><Search size={14} aria-hidden="true" />
        <input autoFocus type="search" role="combobox" aria-label={t("organization.searchPhoneCountry")} aria-expanded="true" aria-autocomplete="list" aria-controls={`${pickerId}-options`} aria-activedescendant={activeId}
          value={query} placeholder={t("organization.searchPhoneCountry")} onChange={(event) => { setQuery(event.target.value); setHighlightedIndex(0); }} onKeyDown={handleKeyDown} />
      </div>
      <div id={`${pickerId}-options`} className="phone-country-options" role="listbox" aria-label={countryLabel}>
        {results.map((option, index) => <button key={option.value ?? "international"} id={`${pickerId}-option-${option.value ?? "international"}`}
          type="button" tabIndex={-1} role="option" aria-selected={value === option.value} className={activeIndex === index ? "is-highlighted" : ""}
          onMouseEnter={() => setHighlightedIndex(index)} onClick={() => selectCountry(option.value)}>
          <span className="phone-country-flag" aria-hidden="true">{option.value ? countryFlag(option.value) : <Globe2 size={17} />}</span>
          <span>{option.label}</span>{option.value && <small>+{getCountryCallingCode(option.value)}</small>}
        </button>)}
      </div>
      {!results.length && <p className="phone-country-empty" role="status">{t("organization.noPhoneCountries")}</p>}
    </div>}
  </div>;
}
