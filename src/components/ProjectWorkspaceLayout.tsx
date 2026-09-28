import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useParams } from "react-router-dom";
import { ProjectNavigation } from "./ProjectNavigation";
import { useApp } from "../state/AppProvider";
import { useI18n } from "../i18n/I18nProvider";
import { NotFoundPage } from "../pages/NotFoundPage";

export function ProjectWorkspaceLayout() {
  const { projectId = "" } = useParams();
  const { getProject } = useApp();
  const { t } = useI18n();
  const project = getProject(projectId);
  if (!project) return <NotFoundPage />;
  return (
    <div className="project-workspace">
      <header className="project-workspace-header">
        <Link className="icon-button" to="/" aria-label={t("nav.projects")}><ArrowLeft size={18} /></Link>
        <div className="project-workspace-title">
          <strong>{project.name}</strong>
          {project.projectNumber?.trim() && <span>{project.projectNumber.trim()}</span>}
        </div>
      </header>
      <ProjectNavigation projectId={project.id} />
      <div className="project-workspace-content"><Outlet /></div>
    </div>
  );
}
