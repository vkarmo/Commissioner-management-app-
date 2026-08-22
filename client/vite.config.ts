import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Commissioner's Office",
        short_name: "Commissioner",
        description: "District Commissioner's Office case, land, and public works management",
        theme_color: "#0f4c3a",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // App-shell caching only; API calls go through the Dexie offline
        // queue instead of the service worker cache (design recap §1).
        navigateFallback: "/index.html",
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
