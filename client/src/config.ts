declare global {
  interface Window {
    __RUNTIME_CONFIG__?: { apiBaseUrl?: string };
  }
}

// Checked in this order: a value written into the served page at container
// startup (Cloud Run split-service deploy — see docker-entrypoint.sh),
// then a build-time Vite env var (local dev via .env), then a relative
// path. The relative default is what makes the combined single-service
// deployment (repo-root Dockerfile, server/src/app.ts serving the built
// client) need zero API URL configuration — same origin, so `/api` just
// works. Local dev overrides it via VITE_API_BASE_URL since the Vite dev
// server and the API run on different ports there.
export const API_BASE_URL =
  window.__RUNTIME_CONFIG__?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || "/api";
