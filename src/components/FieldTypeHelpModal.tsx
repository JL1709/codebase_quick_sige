import { Button, Modal } from "./Ui";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function FieldTypeHelpModal({ open, onClose, t }: { open: boolean; onClose: () => void; t: Translate }) {
  return <Modal className="field-type-help-modal" open={open} title={t("templates.fieldTypeHelpTitle")} onClose={onClose}>
    <div className="modal-body field-type-help-content">
      <p>{t("templates.fieldTypeHelpIntro")}</p>
      <div className="field-type-help-examples">
        <article>
          <strong>{t("templates.entryType.group")}</strong>
          <p>{t("templates.groupHelpText")}</p>
          <div className="field-type-example"><b>{t("templates.groupHelpExample")}</b><span>{t("templates.groupHelpFields")}</span></div>
        </article>
        <article>
          <strong>{t("templates.entryType.repeating_group")}</strong>
          <p>{t("templates.repeatingGroupHelpText")}</p>
          <div className="field-type-example"><b>{t("templates.repeatingGroupHelpExample")}</b><span>{t("templates.repeatingGroupHelpFields")}</span><em>{t("templates.repeatingGroupHelpAction")}</em></div>
        </article>
      </div>
    </div>
    <div className="modal-footer"><Button type="button" onClick={onClose}>{t("common.close")}</Button></div>
  </Modal>;
}
