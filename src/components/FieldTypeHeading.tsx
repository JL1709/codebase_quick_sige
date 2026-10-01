import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { FieldTypeHelpModal } from "./FieldTypeHelpModal";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function FieldTypeHeading({ t }: { t: Translate }) {
  const [helpOpen, setHelpOpen] = useState(false);

  return <>
    <span className="template-entry-type-heading">
      {t("templates.entryType")}
      <button
        type="button"
        className="template-help-button"
        aria-label={t("templates.fieldTypeHelp")}
        onClick={() => setHelpOpen(true)}
      >
        <CircleHelp size={14} />
      </button>
    </span>
    <FieldTypeHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} t={t} />
  </>;
}
