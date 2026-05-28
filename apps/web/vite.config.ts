import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiProxyTarget = process.env["VITE_DEV_API_PROXY_TARGET"] ?? "http://localhost:3000";
const appBuildId =
  process.env["VITE_DEBUGBUNDLE_BUILD_ID"]?.trim() ||
  process.env["GITHUB_SHA"]?.trim() ||
  "development";

function debugBundleBuildMetadataPlugin(): Plugin {
  return {
    name: "debugbundle-build-metadata",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ build_id: appBuildId }, null, 2)}\n`
      });
    }
  };
}

export default defineConfig({
  define: {
    __DEBUGBUNDLE_APP_BUILD_ID__: JSON.stringify(appBuildId)
  },
  plugins: [react(), tailwindcss(), debugBundleBuildMetadataPlugin()],
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
