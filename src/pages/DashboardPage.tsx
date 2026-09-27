import { ArrowRight, CheckCircle2, ClipboardList, FileCheck2, FolderKanban, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, EmptyState, PageHeader } from "../components/Ui";
import type { ProjectStatus } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";

function statusTone(status: ProjectStatus): "neutral" | "success" | "warning" | "info" {
  if (status === "published") return "success";
  if (status === "in_review") return "warning";
  if (status === "archived") return "neutral";
  return "info";
}

export function DashboardPage() {
  const { database } = useApp();
  const { t, formatDate } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
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
            {(["draft", "in_review", "published", "archived"] as ProjectStatus[]).map((projectStatus) => <option key={projectStatus} value={projectStatus}>{t(`status.${projectStatus}`)}</option>)}
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
                    <span><strong>{project.name}</strong><span>{project.projectNumber} · {project.city}</span></span>
                  </div>
                  <div><span className="project-meta-label">{t("project.type")}</span><span className="project-meta-value">{t(`project.type.${project.constructionType}`)}</span></div>
                  <div><span className="project-meta-label">{t("project.schedule")}</span><span className="project-meta-value">{formatDate(project.startDate)} – {formatDate(project.endDate)}</span></div>
                  <div style={{ display: "grid", justifyItems: "end", gap: 10 }}>
                    <Badge tone={statusTone(project.status)}>{t(`status.${project.status}`)}</Badge>
                    <Link to={`/projects/${project.id}`}><Button variant="ghost" size="small">{t("common.open")}<ArrowRight size={14} /></Button></Link>
                  </div>
                </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
