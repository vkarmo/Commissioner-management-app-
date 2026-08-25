declare global {
  interface Window {
    __RUNTIME_CONFIG__?: { apiBaseUrl?: string };
  }
}

// Checked in this order: a value written into the served page at container
// startup (Cloud Run — see docker-entrypoint.sh), then a build-time Vite
// env var (local dev via .env), then a sane local default. The runtime
// path exists so the server's URL is a redeployable setting, not something
// baked into the client image at build time.
export const API_BASE_URL =
  window.__RUNTIME_CONFIG__?.apiBaseUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:4000/api";
