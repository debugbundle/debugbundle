import { initializeThemeDocument } from "./theme.js";
import { isPublicStatusLocation } from "./public-status-routing.js";

const isPublicStatus =
  typeof window !== "undefined" &&
  isPublicStatusLocation(import.meta.env.VITE_PUBLIC_STATUS_PAGE_BASE_URL, window.location);
initializeThemeDocument(undefined, undefined, isPublicStatus ? "system" : undefined);
