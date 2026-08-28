import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gatewayTarget = env.WORKSPACE_DEV_GATEWAY_URL || "http://127.0.0.1:5000";

  return {
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("@phosphor-icons")) return "icons";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/")
            ) {
              return "react-vendor";
            }
            return "vendor";
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom/client"],
    },
    server: {
      host: "0.0.0.0",
      port: 4174,
      strictPort: true,
      allowedHosts: ["terminal.local"],
      proxy: {
        "/api": {
          target: gatewayTarget,
          changeOrigin: true,
        },
      },
      warmup: {
        clientFiles: ["./src/main.jsx"],
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4174,
      strictPort: true,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.mjs"],
      css: true,
    },
    plugins: [react()],
  };
});
