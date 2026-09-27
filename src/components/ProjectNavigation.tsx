import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectNavigation({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  return (
    <nav className="project-nav" aria-label={t("project.navigationLabel")}>
      <NavLink to={`/projects/${projectId}`} end>{t("project.overview")}</NavLink>
      <NavLink to={`/projects/${projectId}/assessment`}>{t("project.assessment")}</NavLink>
      <NavLink to={`/projects/${projectId}/plan`}>{t("project.plan")}</NavLink>
      <NavLink to={`/projects/${projectId}/documents`}>{t("project.documents")}</NavLink>
      <NavLink to={`/projects/${projectId}/revisions`}>{t("project.revisions")}</NavLink>
    </nav>
  );
}
