import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AssessmentPage } from "./pages/AssessmentPage";
import { CatalogPage } from "./pages/CatalogPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlanEditorPage } from "./pages/PlanEditorPage";
import { ProjectFormPage } from "./pages/ProjectFormPage";
import { ProjectPage } from "./pages/ProjectPage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RevisionsPage } from "./pages/RevisionsPage";
import { ProjectWorkspaceLayout } from "./components/ProjectWorkspaceLayout";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<Navigate to="/" replace />} />
        <Route path="projects/new" element={<ProjectFormPage />} />
        <Route path="projects/:projectId/edit" element={<ProjectFormPage />} />
        <Route path="projects/:projectId" element={<ProjectWorkspaceLayout />}>
          <Route index element={<ProjectPage />} />
          <Route path="assessment" element={<AssessmentPage />} />
          <Route path="recommendations" element={<RecommendationsPage />} />
          <Route path="plan" element={<PlanEditorPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="revisions" element={<RevisionsPage />} />
        </Route>
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
