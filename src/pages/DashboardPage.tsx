import { ArrowRight, CheckCircle2, ClipboardList, FileCheck2, FolderKanban, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, Modal, PageHeader } from "../components/Ui";
import type { Project, ProjectStatus } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";

const projectStatuses: ProjectStatus[] = ["draft", "in_review", "published", "archived"];

export function DashboardPage() {
  const { database, deleteProject, updateProjectStatus } = useApp();
  const { t, formatDate } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const filteredProjects = useMemo(() => database.projects.filter((project) => {
    const matchesQuery = `${project.name} ${project.city} ${project.projectNumber}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || project.status === status);
  }), [database.projects, query, status]);

  const activeCount = database.projects.filter((project) => project.status !== "archived").length;
  const draftCount = database.plans.filter((plan) => plan.status === "draft").length;
  const stats = [
    { label: t("dashboard.stat.active"), value: activeCount, icon: FolderKanban },
    { label: t("dashboard.stat.drafts"), value: draftCount, icon: ClipboardList },
    { label: t("dashboard.stat.revisions"), value: database.revisions.length, icon: FileCheck2 },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title", { name: database.user.name })}
        description={t("dashboard.subtitle")}
        action={<Link to="/projects/new"><Button><Plus size={17} />{t("dashboard.newProject")}</Button></Link>}
      />

      <section className="stats-grid" aria-label={t("dashboard.summaryLabel")}>
        {stats.map(({ label, value, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-card-top"><span className="stat-icon"><Icon size={18} /></span><CheckCircle2 size={16} color="#93a09b" /></div>
            <strong>{value}</strong><p>{label}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-header"><h2>{t("dashboard.projects")}</h2><Badge tone="neutral">{filteredProjects.length}</Badge></div>
        <div className="projects-toolbar">
          <div className="search-shell"><Search size={17} /><input aria-label={t("dashboard.searchPlaceholder")} className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dashboard.searchPlaceholder")} /></div>
          <select aria-label={t("dashboard.allStatuses")} className="search-input" value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus | "all")}>
            <option value="all">{t("dashboard.allStatuses")}</option>
            {projectStatuses.map((projectStatus) => <option key={projectStatus} value={projectStatus}>{t(`status.${projectStatus}`)}</option>)}
          </select>
        </div>
        {filteredProjects.length === 0 ? (
          <EmptyState icon={<FolderKanban />} title={t("dashboard.noProjects")} text={t("dashboard.noProjectsText")} action={<Link to="/projects/new"><Button><Plus size={16} />{t("dashboard.newProject")}</Button></Link>} />
        ) : (
          <div className="projects-list">
            {filteredProjects.map((project) => (
                <article className="project-row" key={project.id}>
                  <div className="project-identity">
                    <span className="project-icon"><FolderKanban size={21} /></span>
                    <span><strong>{project.name}</strong><span>{project.projectNumber}</span></span>
                  </div>
                  <div><span className="project-meta-label">{t("project.informationSections")}</span><span className="project-meta-value">{project.overviewSections.length}</span></div>
                  <div><span className="project-meta-label">{t("project.updated")}</span><span className="project-meta-value">{formatDate(project.updatedAt)}</span></div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 10 }}>
                    <select className={`project-status-select status-${project.status}`} aria-label={`${t("project.status")}: ${project.name}`} value={project.status} onChange={(event) => updateProjectStatus(project.id, event.target.value as ProjectStatus)}>{projectStatuses.map((projectStatus) => <option key={projectStatus} value={projectStatus}>{t(`status.${projectStatus}`)}</option>)}</select>
                    <div className="row-actions"><button type="button" className="icon-button danger-icon" aria-label={`${t("common.delete")}: ${project.name}`} onClick={() => setProjectToDelete(project)}><Trash2 size={14} /></button><Link to={`/projects/${project.id}`}><Button variant="ghost" size="small">{t("common.open")}<ArrowRight size={14} /></Button></Link></div>
                  </div>
                </article>
            ))}
          </div>
        )}
      </section>
      <Modal open={Boolean(projectToDelete)} title={t("project.deleteTitle")} onClose={() => setProjectToDelete(null)}>
        <div className="modal-body"><p>{t("project.deleteText", { name: projectToDelete?.name ?? "" })}</p></div>
        <div className="modal-footer"><Button variant="secondary" onClick={() => setProjectToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (!projectToDelete) return; const projectId = projectToDelete.id; setProjectToDelete(null); void deleteProject(projectId); }}>{t("common.delete")}</Button></div>
      </Modal>
    </div>
  );
}
