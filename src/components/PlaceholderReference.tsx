import { Check, ChevronDown, CircleAlert, Copy, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildReferenceGroups, filterReferenceGroups, referenceFieldCount, referenceRepeatBlock, type ReferenceGroup } from "../documents/placeholderReference";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { copyTextToClipboard } from "../utils/clipboard";

const COPY_FEEDBACK_DURATION_MS = 1800;
type CopyFeedback = { text: string; status: "copied" | "failed" } | null;

export function PlaceholderReference() {
  const { database, getProject, getPlanForProject } = useApp();
  const { locale, t } = useI18n();
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [reference, setReference] = useState<{ projectId: string; locale: string; groups: ReferenceGroup[]; error: boolean }>();
  const [feedback, setFeedback] = useState<CopyFeedback>(null);
  const feedbackTimer = useRef<number | null>(null);
  useEffect(() => () => { if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current); }, []);
  useEffect(() => {
    let active = true;
    void import("../documents/templateEngine").then(({ buildTemplateData, templatePlaceholderReference }) => {
      const project = getProject(projectId);
      const data = buildTemplateData(project, getPlanForProject(projectId), locale, database.blocks, database.categories, database.organization);
      const groups = buildReferenceGroups(data, templatePlaceholderReference(data), project, database.organization, t);
      if (active) setReference({ projectId, locale, groups, error: false });
    }).catch(() => { if (active) setReference({ projectId, locale, groups: [], error: true }); });
    return () => { active = false; };
  }, [database, getProject, getPlanForProject, locale, projectId, t]);
  const current = reference?.projectId === projectId && reference.locale === locale ? reference : undefined;
  const groups = useMemo(() => filterReferenceGroups(current?.groups ?? [], query), [current, query]);
  const copy = async (text: string) => {
    const copied = await copyTextToClipboard(text);
    setFeedback({ text, status: copied ? "copied" : "failed" });
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), COPY_FEEDBACK_DURATION_MS);
  };
  return <section className="panel template-reference" aria-labelledby="placeholder-reference-title">
    <header className="reference-header"><h2 id="placeholder-reference-title">{t("templates.placeholderTitle")}</h2><p>{t("templates.placeholderText")}</p></header>
    <div className="reference-controls">
      <label className="field"><span>{t("templates.placeholderProject")}</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t("templates.commonPlaceholders")}</option>{database.projects.filter((project) => project.status !== "archived").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="field"><span>{t("templates.searchPlaceholders")}</span><div className="search-shell"><Search size={15} /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("templates.reference.searchHint")} aria-label={t("templates.searchPlaceholders")} /></div></label>
    </div>
    <p className="reference-context">{t(projectId ? "templates.reference.previewHelp" : "templates.reference.selectProject")}</p>
    <ReferenceHelp />
    {!current ? <p role="status">{t("templates.reference.loading")}</p> : current.error ? <p role="alert">{t("templates.referenceFailed")}</p> : <div className="reference-groups">
      {groups.map((group) => <ReferenceGroupView key={`${projectId}:${locale}:${group.path}`} group={group} sourceGroup={current.groups.find((source) => source.path === group.path)} query={query} defaultOpen={group.path === "qs.project" || !projectId} feedback={feedback} onCopy={copy} />)}
      {!groups.length && <p className="reference-empty" role="status">{t("templates.reference.noResults")}</p>}
    </div>}
    <span className="visually-hidden" role="status">{feedback ? `${t(feedback.status === "copied" ? "templates.copied" : "templates.copyFailed")}: ${feedback.text}` : ""}</span>
  </section>;
}

function ReferenceHelp() {
  const { t } = useI18n();
  return <details className="reference-help"><summary><ChevronDown size={16} />{t("templates.reference.howTo")}</summary><div>
    <ol><li>{t("templates.reference.stepSelect")}</li><li>{t("templates.reference.stepPaste")}</li><li>{t("templates.reference.stepCreate")}</li></ol>
    <p>{t("templates.placeholderLocations")}</p>
    <p>{t("templates.reference.naming")}</p>
    <p>{t("templates.reference.renaming")}</p>
    <p>{t("templates.reference.unknown")}</p>
  </div></details>;
}

interface GroupViewProps {
  group: ReferenceGroup;
  sourceGroup?: ReferenceGroup;
  query: string;
  defaultOpen?: boolean;
  parentCollections?: ReferenceGroup[];
  feedback: CopyFeedback;
  onCopy: (text: string) => Promise<void>;
}

function ReferenceGroupView({ group, sourceGroup = group, query, defaultOpen = false, parentCollections = [], feedback, onCopy }: GroupViewProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultOpen);
  const searching = Boolean(query.trim());
  const collections = group.collection ? [...parentCollections, sourceGroup] : parentCollections;
  const block = group.collection ? referenceRepeatBlock(sourceGroup, parentCollections) : "";
  const initialProjectSection = sourceGroup.path === "qs.project"
    ? sourceGroup.groups.find((child) => !child.collection && child.path !== "qs.project.plan" && child.path !== "qs.project.files")?.path
    : undefined;
  const fieldCount = referenceFieldCount(group);
  // A new search reopens native accordions closed during the previous search.
  return <details key={query.trim()} className={`reference-group ${group.collection ? "is-collection" : ""}`} data-placeholder-group={group.path} open={searching || expanded} onToggle={(event) => { if (!searching) setExpanded(event.currentTarget.open); }}>
    <summary><ChevronDown size={17} /><span>{group.label}</span><small>{t(fieldCount === 1 ? "templates.reference.oneField" : "templates.reference.fieldCount", { count: fieldCount })}</small>{group.collection && <span className="reference-kind">{t("templates.reference.repeating")}</span>}</summary>
    <div className="reference-group-content">
      {group.collection && <div className="reference-repeat">
        <p>{t("templates.reference.repeatHelp")}</p>
        <details className="reference-repeat-example"><summary>{t("templates.reference.showRepeat")}</summary><div>
          <CopyAction text={block} label={t("templates.reference.copyRepeat")} feedback={feedback} onCopy={onCopy} />
          <pre><code>{block}</code></pre>
          {parentCollections.length > 0 && <p>{t("templates.reference.parentLoops")}</p>}
        </div></details>
      </div>}
      {group.fields.map((field) => <div className="reference-field-row" data-placeholder-path={field.path} key={field.path}>
        <div className="reference-field"><strong>{field.label}</strong><button type="button" className={`placeholder-copy ${feedback?.text === field.token ? `is-${feedback.status}` : ""}`} aria-label={`${t("templates.copyPlaceholder")}: ${field.token}`} onClick={() => void onCopy(field.token)}><code>{field.token}</code><CopyFeedbackContent text={field.token} feedback={feedback} /></button></div>
        <div className="reference-value"><span>{t(field.kind === "image" ? "templates.reference.image" : collections.length ? "templates.reference.firstValue" : "templates.reference.currentValue")}</span><p>{field.preview || t("templates.reference.emptyValue")}</p></div>
      </div>)}
      {group.groups.map((child) => <ReferenceGroupView key={child.path} group={child} sourceGroup={sourceGroup.groups.find((source) => source.path === child.path)} query={query} defaultOpen={child.path === initialProjectSection} parentCollections={collections} feedback={feedback} onCopy={onCopy} />)}
    </div>
  </details>;
}

function CopyFeedbackContent({ text, feedback, compact = false }: { text: string; feedback: CopyFeedback; compact?: boolean }) {
  const { t } = useI18n();
  const status = feedback?.text === text ? feedback.status : null;
  return <span className="placeholder-copy-action" aria-hidden="true">{status === "copied" ? <><Check size={14} />{t("templates.copied")}</> : status === "failed" ? <><CircleAlert size={14} />{t("templates.copyFailed")}</> : <><Copy size={14} />{!compact && t("templates.reference.copy")}</>}</span>;
}

function CopyAction({ text, label, feedback, onCopy }: { text: string; label: string; feedback: CopyFeedback; onCopy: (text: string) => Promise<void> }) {
  const status = feedback?.text === text ? feedback.status : null;
  return <button className={`reference-copy-block ${status ? `is-${status}` : ""}`} type="button" aria-label={label} onClick={() => void onCopy(text)}><span>{label}</span><CopyFeedbackContent text={text} feedback={feedback} compact /></button>;
}
