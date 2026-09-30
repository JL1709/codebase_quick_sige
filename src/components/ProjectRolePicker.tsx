import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { STANDARD_PROJECT_ROLES } from "../domain/contacts";
import type { ProjectRoleDefinition } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { Button, Toggle } from "./Ui";

interface ProjectRolePickerProps {
  selectedRoleKeys: string[];
  onChange: (roleKeys: string[]) => void;
  onCreateRole: (name: string, reusable: boolean) => string | undefined;
  projectId?: string;
  additionalDefinitions?: ProjectRoleDefinition[];
  disabled?: boolean;
}

interface RoleOption {
  key: string;
  label: string;
}

export function ProjectRolePicker({
  selectedRoleKeys,
  onChange,
  onCreateRole,
  projectId,
  additionalDefinitions = [],
  disabled = false,
}: ProjectRolePickerProps) {
  const { database } = useApp();
  const { t } = useI18n();
  const pickerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [saveAsReusable, setSaveAsReusable] = useState(true);

  const roleDefinitions = useMemo(() => {
    const definitions = [
      ...database.projectRoleDefinitions.filter((definition) => definition.lifecycle === "active" && (!definition.projectId || definition.projectId === projectId)),
      ...additionalDefinitions.filter((definition) => definition.lifecycle === "active"),
    ];
    return definitions.filter((definition, index) => definitions.findIndex((candidate) => candidate.id === definition.id) === index)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  }, [additionalDefinitions, database.projectRoleDefinitions, projectId]);

  const standardOptions = STANDARD_PROJECT_ROLES.map<RoleOption>((role) => ({
    key: `system:${role}`,
    label: t(`contacts.role.${role}`),
  }));
  const reusableOptions = roleDefinitions.filter((definition) => !definition.projectId).map<RoleOption>((definition) => ({
    key: `custom:${definition.id}`,
    label: definition.name,
  }));
  const projectOptions = roleDefinitions.filter((definition) => Boolean(definition.projectId)).map<RoleOption>((definition) => ({
    key: `custom:${definition.id}`,
    label: definition.name,
  }));
  const allOptions = [...standardOptions, ...reusableOptions, ...projectOptions];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = (option: RoleOption) => !normalizedQuery || option.label.toLocaleLowerCase().includes(normalizedQuery);
  const selectedOptions = selectedRoleKeys.flatMap((roleKey) => {
    const option = allOptions.find((candidate) => candidate.key === roleKey);
    return option ? [option] : [];
  });
  const normalizedNewRoleName = newRoleName.trim().toLocaleLowerCase();
  const roleNameConflict = Boolean(normalizedNewRoleName) && allOptions.some((option) => option.label.trim().toLocaleLowerCase() === normalizedNewRoleName);

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    setCreating(false);
    setNewRoleName("");
    setSaveAsReusable(true);
  };

  const toggleRole = (roleKey: string) => {
    onChange(selectedRoleKeys.includes(roleKey)
      ? selectedRoleKeys.filter((candidate) => candidate !== roleKey)
      : [...selectedRoleKeys, roleKey]);
  };

  const createRole = () => {
    const name = newRoleName.trim();
    if (!name || roleNameConflict) return;
    const roleKey = onCreateRole(name, saveAsReusable);
    if (roleKey && !selectedRoleKeys.includes(roleKey)) onChange([...selectedRoleKeys, roleKey]);
    setNewRoleName("");
    setSaveAsReusable(true);
    setCreating(false);
    setQuery("");
  };

  const renderGroup = (label: string, options: RoleOption[]) => {
    const visibleOptions = options.filter(matching);
    if (visibleOptions.length === 0) return null;
    return <div className="project-role-picker-group">
      <h4>{label}</h4>
      {visibleOptions.map((option) => <label key={option.key}>
        <input
          type="checkbox"
          checked={selectedRoleKeys.includes(option.key)}
          onChange={() => toggleRole(option.key)}
        />
        <span>{option.label}</span>
        {selectedRoleKeys.includes(option.key) && <Check size={13} aria-hidden="true" />}
      </label>)}
    </div>;
  };

  return <div className="project-role-picker" ref={rootRef}>
    <div className="project-role-picker-summary">
      <div className="project-role-pills" aria-label={t("projectRoles.selectedRoles")}>
        {selectedOptions.length === 0 && <span className="project-role-empty">{t("projectRoles.noSelectedRoles")}</span>}
        {selectedOptions.map((option) => <span className="project-role-pill" key={option.key}>
          {option.label}
          {!disabled && <button type="button" aria-label={`${t("common.remove")}: ${option.label}`} onClick={() => toggleRole(option.key)}><X size={11} /></button>}
        </span>)}
      </div>
      <Button
        type="button"
        size="small"
        variant="secondary"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={`${pickerId}-popover`}
        onClick={() => {
          setOpen((current) => !current);
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }}
      >{t("projectRoles.manage")}<ChevronDown size={13} /></Button>
    </div>

    {open && <div className="project-role-picker-popover" id={`${pickerId}-popover`} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <div className="project-role-picker-search"><Search size={14} /><input ref={searchRef} aria-label={t("projectRoles.search")} value={query} placeholder={t("projectRoles.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="project-role-picker-options">
        {renderGroup(t("projectRoles.standard"), standardOptions)}
        {renderGroup(t("projectRoles.reusable"), reusableOptions)}
        {renderGroup(t("projectRoles.projectOnly"), projectOptions)}
        {[...standardOptions, ...reusableOptions, ...projectOptions].filter(matching).length === 0 && <p>{t("projectRoles.noMatches")}</p>}
      </div>
      <div className="project-role-picker-create">
        {!creating ? <Button type="button" size="small" variant="ghost" onClick={() => setCreating(true)}><Plus size={13} />{t("contacts.createRole")}</Button> : <>
          <label className="field"><span>{t("projectRoles.name")}</span><input autoFocus value={newRoleName} aria-invalid={roleNameConflict} onChange={(event) => setNewRoleName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createRole(); } }} />{roleNameConflict && <small className="field-error">{t("projectRoles.nameConflict")}</small>}</label>
          <div className="project-role-scope-toggle"><Toggle checked={saveAsReusable} onChange={setSaveAsReusable} label={t("projectRoles.saveReusable")} /><small>{t(saveAsReusable ? "projectRoles.reusableHelp" : "projectRoles.projectOnlyHelp")}</small></div>
          <div className="row-actions"><Button type="button" size="small" variant="ghost" onClick={() => { setCreating(false); setNewRoleName(""); setSaveAsReusable(true); }}>{t("common.cancel")}</Button><Button type="button" size="small" disabled={!newRoleName.trim() || roleNameConflict} onClick={createRole}>{t("projectRoles.add")}</Button></div>
        </>}
      </div>
      <div className="project-role-picker-footer"><Button type="button" size="small" onClick={close}>{t("projectRoles.done")}</Button></div>
    </div>}
  </div>;
}
