import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4318,
    proxy: { "/health": "http://localhost:4317", "/sources": "http://localhost:4317" },
  },
});
