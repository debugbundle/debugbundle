import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

import "./lib/theme-init.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { isPublicStatusLocation } from "./lib/public-status-routing.js";
import { App } from "./app.js";
import { initializeWebDogfooding, observeWebAnalyticsConsentWithdrawal } from "./lib/dogfooding.js";
import "./styles/globals.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("debugbundle_web_root_not_found");
}

if (!isPublicStatusLocation(import.meta.env.VITE_PUBLIC_STATUS_PAGE_BASE_URL, window.location)) {
  initializeWebDogfooding(import.meta.env);
  observeWebAnalyticsConsentWithdrawal();
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
