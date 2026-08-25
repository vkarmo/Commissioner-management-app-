#!/bin/sh
set -e

# Writes the server URL into the served bundle at container startup (see
# src/config.ts), so it's a Cloud Run env var — set/changed via
# `gcloud run services update ... --set-env-vars API_BASE_URL=...` — not
# something baked into the image at build time. Escaped for safe embedding
# in a double-quoted JS string, in case the URL ever carries a query string.
ESCAPED_API_BASE_URL=$(printf '%s' "${API_BASE_URL:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > /app/dist/runtime-config.js <<EOF
window.__RUNTIME_CONFIG__ = { apiBaseUrl: "${ESCAPED_API_BASE_URL}" };
EOF

exec serve -s dist -l "tcp://0.0.0.0:${PORT:-8080}"
