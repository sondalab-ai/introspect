import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single regex covers every read-only endpoint exposed by the server.
// Keep this in sync with server/src/api/server.ts when new endpoints land.
const API_ROUTES =
  "^/(health|sources|instructions|agents|commands|skills|memories|plugins|settings|projects|sessions|profile|export)(/|$)";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4318,
    proxy: {
      [API_ROUTES]: "http://localhost:4317",
      "/ws/live": { target: "ws://localhost:4317", ws: true },
    },
  },
});
