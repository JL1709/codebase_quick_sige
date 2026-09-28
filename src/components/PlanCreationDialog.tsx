import { ClipboardList, Copy, FileClock, FilePlus2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MAX_PLAN_REASON_LENGTH } from "../domain/planLifecycle";
import type { PlanRevision } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { Button, Modal } from "./Ui";

interface PlanCreationDialogProps {
  open: boolean;
  hasCurrentPlan: boolean;
  revisions: PlanRevision[];
  onClose: () => void;
  onStartAssessment: (reason: string) => void;
  onCopyCurrent: (reason: string) => void;
  onCreateBlank: (reason: string) => void;
  onCreateFromRevision: (revisionId: string, reason: string) => void;
}

export function PlanCreationDialog({
  open,
  hasCurrentPlan,
  revisions,
  onClose,
  onStartAssessment,
  onCopyCurrent,
  onCreateBlank,
  onCreateFromRevision,
}: PlanCreationDialogProps) {
  const { t, formatDate } = useI18n();
  const [reason, setReason] = useState("");
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? "");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setRevisionId(revisions[0]?.id ?? "");
  }, [open, revisions]);

  const selectMethod = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Modal open={open} title={t("planCreation.title")} onClose={onClose} className="plan-creation-modal">
      <div className="modal-body plan-creation-body">
        <p className="plan-creation-intro">{t(hasCurrentPlan ? "planCreation.subtitleExisting" : "planCreation.subtitleEmpty")}</p>
        {hasCurrentPlan && (
          <>
            <div className="plan-creation-warning">{t("planCreation.draftWarning")}</div>
            <label className="field">
              <span>{t("planCreation.reasonLabel")}</span>
              <input maxLength={MAX_PLAN_REASON_LENGTH} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("planCreation.reasonPlaceholder")} />
              <small>{t("planCreation.reasonHelp")}</small>
            </label>
          </>
        )}

        <div className="plan-creation-options">
          <button type="button" className="plan-creation-option is-recommended" onClick={() => selectMethod(() => onStartAssessment(reason))}>
            <span className="plan-creation-option-icon"><ClipboardList size={20} /></span>
            <span><strong>{t("planCreation.guidedTitle")}</strong><small>{t("planCreation.guidedText")}</small></span>
            <em>{t("planCreation.recommended")}</em>
          </button>

          {hasCurrentPlan && (
            <button type="button" className="plan-creation-option" onClick={() => selectMethod(() => onCopyCurrent(reason))}>
              <span className="plan-creation-option-icon"><Copy size={20} /></span>
              <span><strong>{t("planCreation.currentTitle")}</strong><small>{t("planCreation.currentText")}</small></span>
            </button>
          )}

          {revisions.length > 0 && (
            <div className="plan-creation-option plan-creation-revision-option">
              <span className="plan-creation-option-icon"><FileClock size={20} /></span>
              <span><strong>{t("planCreation.revisionTitle")}</strong><small>{t("planCreation.revisionText")}</small></span>
              <label>
                <span>{t("planCreation.revisionSelect")}</span>
                <select value={revisionId} onChange={(event) => setRevisionId(event.target.value)}>
                  {revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.index} · {formatDate(revision.publishedAt)} · {revision.changeSummary}</option>)}
                </select>
              </label>
              <Button variant="secondary" size="small" disabled={!revisionId} onClick={() => selectMethod(() => onCreateFromRevision(revisionId, reason))}>{t("planCreation.useRevision")}</Button>
            </div>
          )}

          <button type="button" className="plan-creation-option" onClick={() => selectMethod(() => onCreateBlank(reason))}>
            <span className="plan-creation-option-icon"><FilePlus2 size={20} /></span>
            <span><strong>{t("planCreation.blankTitle")}</strong><small>{t("planCreation.blankText")}</small></span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
