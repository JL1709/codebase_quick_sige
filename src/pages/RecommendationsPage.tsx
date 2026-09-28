import { ArrowLeft, ArrowRight, CheckCircle2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BlockVisual } from "../components/BlockVisual";
import { Badge, Button, PageHeader, Toggle } from "../components/Ui";
import { blockHierarchyColor } from "../domain/categoryTree";
import { assessRequirements, generateRecommendations, toggleRecommendation } from "../domain/recommendationEngine";
import type { RecommendationStrength } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

function strengthTone(strength: RecommendationStrength): "danger" | "warning" | "info" {
  if (strength === "required_review") return "danger";
  if (strength === "strong") return "warning";
  return "info";
}

export function RecommendationsPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, getAssessment, createPlan } = useApp();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const project = getProject(projectId);
  const assessment = getAssessment(projectId);
  const initialRecommendations = useMemo(() => project ? generateRecommendations(project, assessment) : [], [project, assessment]);
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  if (!project) return <NotFoundPage />;
  const requirement = assessRequirements(project, assessment);
  const blockMap = new Map(database.blocks.map((block) => [block.id, block]));
  const includedCount = recommendations.filter((recommendation) => recommendation.included).length;

  const handleCreate = () => {
    createPlan(project.id, recommendations);
    navigate(`/projects/${project.id}/plan`);
  };

  return (
    <div className="page page-narrow">
      <PageHeader eyebrow={t("recommendations.eyebrow")} title={t("recommendations.title")} description={t("recommendations.subtitle", { count: recommendations.length })} action={<Link to={`/projects/${project.id}/assessment`}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>} />
      <section className="requirement-card">
        <div><h3>{t("recommendations.requirementTitle")}</h3><p>{t("recommendations.indicative")}</p></div>
        <div className="requirement-flags">
          <span className={`requirement-flag ${requirement.advanceNoticeLikelyRequired ? "is-active" : ""}`}>{requirement.advanceNoticeLikelyRequired ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}{t("recommendations.advanceNotice")}</span>
          <span className={`requirement-flag ${requirement.sigePlanLikelyRequired ? "is-active" : ""}`}>{requirement.sigePlanLikelyRequired ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}{t("recommendations.sigePlan")}</span>
          <span className={`requirement-flag ${requirement.particularlyHazardousWork ? "is-active" : ""}`}><ShieldAlert size={13} />{t("recommendations.hazardous")}</span>
        </div>
      </section>
      <div className="recommendation-list">
        {recommendations.map((recommendation) => {
          const block = blockMap.get(recommendation.blockId);
          if (!block) return null;
          const content = block.translations[locale] ?? block.translations.de;
          return <article className={`recommendation-card ${recommendation.included ? "" : "is-excluded"}`} key={recommendation.id}>
            <BlockVisual visualKey={block.visualKey} color={blockHierarchyColor(block, database.categories)} />
            <div className="recommendation-content"><div className="recommendation-title"><strong>{content.title}</strong><Badge tone={strengthTone(recommendation.strength)}>{t(`recommendations.${recommendation.strength}`)}</Badge></div><p>{t(recommendation.reasonKey, recommendation.reasonParams)}</p></div>
            <Toggle checked={recommendation.included} onChange={() => setRecommendations((current) => toggleRecommendation(current, recommendation.id))} label={recommendation.included ? t("recommendations.included") : t("recommendations.excluded")} />
          </article>;
        })}
      </div>
      <footer className="recommendations-footer"><p>{t("recommendations.includedCount", { included: includedCount, total: recommendations.length })}</p><Button onClick={handleCreate}>{t("recommendations.generate")}<ArrowRight size={16} /></Button></footer>
    </div>
  );
}
