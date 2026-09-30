import { STANDARD_PROJECT_ROLES } from "../domain/contacts";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";

export const CREATE_PROJECT_ROLE_VALUE = "create-project-role";

export function ProjectRoleSelect({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel?: string }) {
  const { database } = useApp();
  const { t } = useI18n();
  const customRoles = database.projectRoleDefinitions
    .filter((definition) => definition.lifecycle === "active" && !definition.projectId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  return <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">{t("projectRoles.choose")}</option>
    <optgroup label={t("projectRoles.standard")}>
      {STANDARD_PROJECT_ROLES.map((role) => <option key={role} value={`system:${role}`}>{t(`contacts.role.${role}`)}</option>)}
    </optgroup>
    {customRoles.length > 0 && <optgroup label={t("projectRoles.custom")}>
      {customRoles.map((definition) => <option key={definition.id} value={`custom:${definition.id}`}>{definition.name}</option>)}
    </optgroup>}
    <option value={CREATE_PROJECT_ROLE_VALUE}>{t("contacts.createRole")}</option>
  </select>;
}
