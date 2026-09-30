import { ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { STANDARD_PROJECT_ROLES } from "../domain/contacts";
import type { ProjectRoleDefinition } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { Button, Modal } from "./Ui";

export function ProjectRolesTemplateSection() {
  const {
    database,
    createProjectRoleDefinition,
    saveProjectRoleDefinition,
    archiveProjectRoleDefinition,
    reorderProjectRoleDefinitions,
  } = useApp();
  const { t } = useI18n();
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ProjectRoleDefinition | null>(null);
  const [roleName, setRoleName] = useState("");
  const canManageRoles = database.user.role !== "viewer";
  const orderedProjectRoles = database.projectRoleDefinitions.filter((definition) => !definition.projectId).sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
  const normalizedRoleName = roleName.trim().toLocaleLowerCase();
  const roleNameConflict = database.projectRoleDefinitions.some((definition) => (
    definition.id !== editingRole?.id
    && !definition.projectId
    && definition.lifecycle === "active"
    && definition.name.trim().toLocaleLowerCase() === normalizedRoleName
  ));

  const openRoleModal = (definition?: ProjectRoleDefinition) => {
    setEditingRole(definition ?? null);
    setRoleName(definition?.name ?? "");
    setRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    setRoleModalOpen(false);
    setEditingRole(null);
    setRoleName("");
  };

  const saveRole = (event: FormEvent) => {
    event.preventDefault();
    const trimmedRoleName = roleName.trim();
    if (!trimmedRoleName || roleNameConflict) return;
    if (editingRole) saveProjectRoleDefinition({ ...editingRole, name: trimmedRoleName });
    else createProjectRoleDefinition(trimmedRoleName);
    closeRoleModal();
  };

  const moveRole = (definitionId: string, direction: -1 | 1) => {
    const currentIndex = orderedProjectRoles.findIndex((definition) => definition.id === definitionId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedProjectRoles.length) return;
    const reorderedRoles = [...orderedProjectRoles];
    [reorderedRoles[currentIndex], reorderedRoles[nextIndex]] = [reorderedRoles[nextIndex], reorderedRoles[currentIndex]];
    reorderProjectRoleDefinitions(reorderedRoles.map((definition) => definition.id));
  };

  return <>
    <section className="settings-section project-roles-template-section">
      <div className="settings-section-header">
        <div><h2>{t("projectRoles.title")}</h2><p>{t("projectRoles.text")}</p></div>
        <Button disabled={!canManageRoles} onClick={() => openRoleModal()}><Plus size={15} />{t("projectRoles.add")}</Button>
      </div>
      <div className="project-role-settings-groups">
        <div>
          <h3>{t("projectRoles.standard")}</h3>
          <div className="project-role-settings-list">
            {STANDARD_PROJECT_ROLES.map((role) => <article key={role}><strong>{t(`contacts.role.${role}`)}</strong><span>{t("projectRoles.systemBadge")}</span></article>)}
          </div>
        </div>
        <div>
          <h3>{t("projectRoles.custom")}</h3>
          {orderedProjectRoles.length === 0
            ? <p className="field-help">{t("projectRoles.noCustom")}</p>
            : <div className="project-role-settings-list">
              {orderedProjectRoles.map((definition, index) => <article className={definition.lifecycle === "archived" ? "is-archived" : ""} key={definition.id}>
                <strong>{definition.name}</strong>
                <span>{t("projectRoles.customBadge")}</span>
                <div className="row-actions">
                  <button type="button" className="icon-button" disabled={!canManageRoles || index === 0} aria-label={`${t("common.moveUp")}: ${definition.name}`} onClick={() => moveRole(definition.id, -1)}><ArrowUp size={13} /></button>
                  <button type="button" className="icon-button" disabled={!canManageRoles || index === orderedProjectRoles.length - 1} aria-label={`${t("common.moveDown")}: ${definition.name}`} onClick={() => moveRole(definition.id, 1)}><ArrowDown size={13} /></button>
                  <Button size="small" variant="secondary" disabled={!canManageRoles} onClick={() => openRoleModal(definition)}><Pencil size={13} />{t("common.edit")}</Button>
                  {definition.lifecycle === "active"
                    ? <button type="button" className="icon-button danger-icon" disabled={!canManageRoles} aria-label={`${t("projectRoles.archive")}: ${definition.name}`} onClick={() => archiveProjectRoleDefinition(definition.id)}><Trash2 size={13} /></button>
                    : <button type="button" className="icon-button" disabled={!canManageRoles} aria-label={`${t("common.restore")}: ${definition.name}`} onClick={() => saveProjectRoleDefinition({ ...definition, lifecycle: "active" })}><ArchiveRestore size={13} /></button>}
                </div>
              </article>)}
            </div>}
        </div>
      </div>
    </section>

    <Modal open={roleModalOpen} title={t(editingRole ? "projectRoles.edit" : "projectRoles.add")} onClose={closeRoleModal}>
      <form onSubmit={saveRole}>
        <div className="modal-body">
          <label className="field">
            <span>{t("projectRoles.name")}</span>
            <input autoFocus required aria-invalid={roleNameConflict} value={roleName} onChange={(event) => setRoleName(event.target.value)} />
            {roleNameConflict && <small className="field-error">{t("projectRoles.nameConflict")}</small>}
          </label>
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={closeRoleModal}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!roleName.trim() || roleNameConflict}>{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  </>;
}
