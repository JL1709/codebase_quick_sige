import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function Button({
  variant = "primary",
  size = "medium",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "small" | "medium" }) {
  return <button className={`button button-${variant} button-${size} ${className}`} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const normalizedValue = Math.max(0, Math.min(100, value));
  return <div className="progress-track" role="progressbar" aria-label={`${normalizedValue}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalizedValue}><span style={{ width: `${normalizedValue}%` }} /></div>;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Modal({ open, title, children, onClose, className = "" }: { open: boolean; title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label={t("common.close")}><X size={20} /></button></header>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" className={`toggle ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}>
      <span /><em>{label}</em>
    </button>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
