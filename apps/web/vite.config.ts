import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devMockEnabled, devMockPlugin } from "./dev-mock-plugin.js";

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

export default defineConfig(({ command, mode }) => {
  const mock = devMockEnabled(command, mode, process.env);
  return {
    define: {
      __DEBUGBUNDLE_APP_BUILD_ID__: JSON.stringify(appBuildId),
      ...(mock
        ? {
            "import.meta.env.VITE_API_URL": JSON.stringify(""),
            "import.meta.env.VITE_DEBUGBUNDLE_DOGFOOD_ENABLED": JSON.stringify("false"),
            "import.meta.env.VITE_DEBUGBUNDLE_DOGFOOD_ANALYTICS_ENABLED": JSON.stringify("false")
          }
        : {})
    },
    plugins: [
      react(),
      tailwindcss(),
      debugBundleBuildMetadataPlugin(),
      ...(mock ? [devMockPlugin()] : [])
    ],
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
  };
});
