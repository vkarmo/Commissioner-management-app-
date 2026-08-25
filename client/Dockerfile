# Cloud Run monorepo note: build/deploy this with the source directory
# set to `client/` (not the repo root) — `server/` is a separate Cloud
# Run service with its own Dockerfile. If you're using Cloud Run's
# "Create Service from repository" wizard and it can't find a build file,
# that wizard doesn't support pointing at a subdirectory of a monorepo —
# use `gcloud run deploy --source client` instead (see README.md).
#
# The server's URL is a runtime setting (API_BASE_URL env var, read by
# docker-entrypoint.sh), not a build-time one — so this image doesn't need
# to know the server's URL to build, and can be redeployed to point at a
# different server without rebuilding.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 8080
# `serve -s` (single-page app mode, set in the entrypoint script) falls
# back to index.html for any path that isn't a real static file, so
# client-side routing (react-router-dom's BrowserRouter) survives a
# reload or deep link.
ENTRYPOINT ["./docker-entrypoint.sh"]
