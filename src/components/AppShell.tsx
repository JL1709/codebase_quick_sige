import { BookOpenText, BriefcaseBusiness, ChevronDown, LayoutTemplate, PanelLeftClose, PanelLeftOpen, Settings, Sparkles } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";

const NAVIGATION_COLLAPSED_STORAGE_KEY = "quicksige.navigation.collapsed";

export function AppShell() {
  const { database } = useApp();
  const { t } = useI18n();
  const [navigationCollapsed, setNavigationCollapsed] = useState(
    () => window.localStorage.getItem(NAVIGATION_COLLAPSED_STORAGE_KEY) === "true",
  );
  const toggleNavigation = () => {
    setNavigationCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      window.localStorage.setItem(NAVIGATION_COLLAPSED_STORAGE_KEY, String(nextCollapsed));
      return nextCollapsed;
    });
  };

  return (
    <div className={`app-frame ${navigationCollapsed ? "navigation-collapsed" : ""}`}>
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-controls="primary-navigation"
          aria-expanded={!navigationCollapsed}
          aria-label={t(navigationCollapsed ? "nav.expandNavigation" : "nav.collapseNavigation")}
          title={t(navigationCollapsed ? "nav.expandNavigation" : "nav.collapseNavigation")}
          onClick={toggleNavigation}
        >
          {navigationCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <NavLink className="brand" to="/" aria-label={t("nav.homeLabel")} title={t("nav.homeLabel")}>
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>
            <strong>QuickSiGe</strong>
            <small>{t("app.tagline")}</small>
          </span>
        </NavLink>

        <nav id="primary-navigation" className="sidebar-nav" aria-label={t("nav.primaryLabel")}>
          <NavLink to="/" end aria-label={t("nav.projects")} title={t("nav.projects")}><BriefcaseBusiness size={19} /><span>{t("nav.projects")}</span></NavLink>
          <NavLink to="/catalog" aria-label={t("nav.catalog")} title={t("nav.catalog")}><BookOpenText size={19} /><span>{t("nav.catalog")}</span></NavLink>
          <NavLink to="/templates" aria-label={t("nav.templates")} title={t("nav.templates")}><LayoutTemplate size={19} /><span>{t("nav.templates")}</span></NavLink>
          <NavLink to="/settings" aria-label={t("nav.settings")} title={t("nav.settings")}><Settings size={19} /><span>{t("nav.settings")}</span></NavLink>
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
