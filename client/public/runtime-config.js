// Default/local-dev placeholder. In the container image, docker-entrypoint.sh
// overwrites this file at startup from the API_BASE_URL env var, so the
// server's URL is a runtime setting instead of something baked into the
// build (see client/Dockerfile). Loaded before src/main.tsx — see index.html.
window.__RUNTIME_CONFIG__ = window.__RUNTIME_CONFIG__ || {};
