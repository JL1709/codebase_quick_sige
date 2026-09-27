import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/docx/")) return "docx";
          if (id.includes("/node_modules/jspdf/") || id.includes("/node_modules/html2canvas/") || id.includes("/node_modules/dompurify/")) return "pdf";
        },
      },
    },
  },
  server: { port: 4173 },
  preview: { port: 4173 },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
