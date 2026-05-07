import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiProxyTarget = process.env["VITE_DEV_API_PROXY_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
    }
  },
  server: {
    port: 5291,
    host: "0.0.0.0",
    proxy: {
      "/debugbundle": {
        target: apiProxyTarget,
        changeOrigin: true
      },
      "/v1": {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  }
});