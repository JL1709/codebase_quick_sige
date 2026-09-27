import { CircleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState } from "../components/Ui";
import { useI18n } from "../i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return <div className="page"><EmptyState icon={<CircleAlert />} title="404" text={t("error.notFound")} action={<Link to="/"><Button>{t("nav.projects")}</Button></Link>} /></div>;
}
