import { ArrowLeft, ArrowRight, Building2, CircleHelp, ClipboardList, CloudSun, Pickaxe } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, PageHeader } from "../components/Ui";
import { defaultAssessmentAnswers } from "../data/seed";
import type { AssessmentAnswers, Season } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { formatProjectIdentity } from "../domain/projectMetadata";
import { useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

function BooleanQuestion({ label, value, onChange, yes, no }: { label: string; value: boolean; onChange: (value: boolean) => void; yes: string; no: string }) {
  return <div className="question-card"><span className="question-label">{label}</span><div className="boolean-choice"><button type="button" className={value ? "is-selected" : ""} onClick={() => onChange(true)}>{yes}</button><button type="button" className={!value ? "is-selected" : ""} onClick={() => onChange(false)}>{no}</button></div></div>;
}

export function AssessmentPage() {
  const { projectId = "" } = useParams();
  const { getProject, getAssessmentRun, getLatestAssessmentRun, saveAssessment } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const project = getProject(projectId);
  const requestedRun = getAssessmentRun(searchParams.get("assessmentRunId") ?? "");
  const initialRun = requestedRun?.projectId === projectId ? requestedRun : getLatestAssessmentRun(projectId);
  const [assessmentRunId, setAssessmentRunId] = useState<string | undefined>(() => initialRun?.completedAt ? undefined : initialRun?.id);
  const [answers, setAnswers] = useState<AssessmentAnswers>(() => structuredClone(initialRun?.answers ?? defaultAssessmentAnswers));
  const [step, setStep] = useState(0);
  if (!project) return <NotFoundPage />;

  const steps = [
    { key: "scope", icon: ClipboardList },
    { key: "environment", icon: Building2 },
    { key: "activities", icon: Pickaxe },
    { key: "conditions", icon: CloudSun },
  ];
  const update = <Key extends keyof AssessmentAnswers>(key: Key, value: AssessmentAnswers[Key]) => setAnswers((current) => ({ ...current, [key]: value }));
  const next = () => {
    const completed = step === steps.length - 1;
    const savedRun = saveAssessment(project.id, assessmentRunId, answers, completed);
    setAssessmentRunId(savedRun.id);
    if (completed) navigate(`/projects/${project.id}/recommendations?assessmentRunId=${savedRun.id}`);
    else setStep((current) => current + 1);
  };

  return (
    <div className="workspace-page">
      <PageHeader eyebrow={t("assessment.eyebrow")} title={t("assessment.title")} description={t("assessment.subtitle")} action={<Link to={`/projects/${project.id}/plan`}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>} />
      <div className="assessment-layout">
        <aside className="assessment-steps">
          {steps.map(({ key, icon: Icon }, index) => <button type="button" key={key} className={`assessment-step ${index === step ? "is-active" : ""}`} onClick={() => setStep(index)}><span>{index < step ? "✓" : <Icon size={15} />}</span><strong>{t(`assessment.step.${key}`)}</strong></button>)}
        </aside>

        <section className="panel assessment-card">
          <div className="assessment-card-header"><p className="eyebrow">{t("assessment.progress", { current: step + 1, total: steps.length })}</p><h2>{t(`assessment.step.${steps[step].key}`)}</h2><p>{formatProjectIdentity(project)}</p></div>
          <div className="assessment-fields">
            {step === 0 && <>
              <label className="question-card"><span>{t("assessment.employerCount")}</span><input type="number" min="1" value={answers.employerCount} onChange={(event) => update("employerCount", Number(event.target.value))} /></label>
              <label className="question-card"><span>{t("assessment.maxWorkers")}</span><input type="number" min="1" value={answers.maxWorkers} onChange={(event) => update("maxWorkers", Number(event.target.value))} /></label>
              <label className="question-card"><span>{t("assessment.workDays")}</span><input type="number" min="1" value={answers.workDays} onChange={(event) => update("workDays", Number(event.target.value))} /></label>
              <label className="question-card"><span>{t("assessment.personDays")}</span><input type="number" min="1" value={answers.estimatedPersonDays} onChange={(event) => update("estimatedPersonDays", Number(event.target.value))} /></label>
            </>}
            {step === 1 && <>
              <BooleanQuestion label={t("assessment.liveOperations")} value={answers.liveOperations} onChange={(value) => update("liveOperations", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.publicTraffic")} value={answers.publicTraffic} onChange={(value) => update("publicTraffic", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.existingUtilities")} value={answers.existingUtilities} onChange={(value) => update("existingUtilities", value)} yes={t("common.yes")} no={t("common.no")} />
            </>}
            {step === 2 && <>
              <label className="question-card"><span>{t("assessment.excavationDepth")}</span><input type="number" min="0" step="0.1" value={answers.excavationDepth} onChange={(event) => update("excavationDepth", Number(event.target.value))} /></label>
              <label className="question-card"><span>{t("assessment.maxWorkHeight")}</span><input type="number" min="0" step="0.1" value={answers.maxWorkHeight} onChange={(event) => update("maxWorkHeight", Number(event.target.value))} /></label>
              <BooleanQuestion label={t("assessment.cranes")} value={answers.cranesOrLifting} onChange={(value) => update("cranesOrLifting", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.scaffolding")} value={answers.scaffolding} onChange={(value) => update("scaffolding", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.temporaryPower")} value={answers.temporaryPower} onChange={(value) => update("temporaryPower", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.hotWorks")} value={answers.hotWorks} onChange={(value) => update("hotWorks", value)} yes={t("common.yes")} no={t("common.no")} />
            </>}
            {step === 3 && <>
              <BooleanQuestion label={t("assessment.hazardousSubstances")} value={answers.hazardousSubstances} onChange={(value) => update("hazardousSubstances", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.waterRisk")} value={answers.waterOrDrowningRisk} onChange={(value) => update("waterOrDrowningRisk", value)} yes={t("common.yes")} no={t("common.no")} />
              <BooleanQuestion label={t("assessment.confinedSpaces")} value={answers.confinedSpaces} onChange={(value) => update("confinedSpaces", value)} yes={t("common.yes")} no={t("common.no")} />
              <label className="question-card"><span>{t("assessment.season")}</span><select value={answers.season} onChange={(event) => update("season", event.target.value as Season)}>{(["spring", "summer", "autumn", "winter", "year_round"] as Season[]).map((season) => <option key={season} value={season}>{t(`season.${season}`)}</option>)}</select></label>
              <label className="question-card"><span>{t("assessment.notes")}</span><textarea value={answers.notes} onChange={(event) => update("notes", event.target.value)} /></label>
            </>}
            <div className="assessment-callout"><CircleHelp size={20} /><span><strong>{t("assessment.why")}</strong><p>{t("assessment.whyText")}</p></span></div>
          </div>
          <footer className="assessment-footer"><Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} />{t("common.back")}</Button><Button onClick={next}>{step === steps.length - 1 ? t("recommendations.title") : t("common.continue")}<ArrowRight size={15} /></Button></footer>
        </section>
      </div>
    </div>
  );
}
