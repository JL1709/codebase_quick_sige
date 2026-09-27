import { BookOpenText, BriefcaseBusiness, ChevronDown, LayoutTemplate, Settings, Sparkles } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";

export function AppShell() {
  const { database } = useApp();
  const { t } = useI18n();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label={t("nav.homeLabel")}>
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>
            <strong>QuickSiGe</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </NavLink>

        <nav className="sidebar-nav" aria-label={t("nav.primaryLabel")}>
          <NavLink to="/" end><BriefcaseBusiness size={19} /><span>{t("nav.projects")}</span></NavLink>
          <NavLink to="/catalog"><BookOpenText size={19} /><span>{t("nav.catalog")}</span></NavLink>
          <NavLink to="/templates"><LayoutTemplate size={19} /><span>{t("nav.templates")}</span></NavLink>
          <NavLink to="/settings"><Settings size={19} /><span>{t("nav.settings")}</span></NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-chip">
            <span className="avatar">{database.user.name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{database.user.name}</strong><small>{database.organization.name}</small></span>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  );
}
