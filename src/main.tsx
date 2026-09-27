import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AppProvider, useApp } from "./state/AppProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

function LocalizedApplication() {
  const { database, setLocale } = useApp();
  return (
    <I18nProvider locale={database.user.preferredLocale} setLocale={setLocale}>
      <App />
    </I18nProvider>
  );
}

const container = document.getElementById("root") as (HTMLElement & { quickSiGeRoot?: Root });
const root = container.quickSiGeRoot ?? createRoot(container);
container.quickSiGeRoot = root;
root.render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <LocalizedApplication />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
