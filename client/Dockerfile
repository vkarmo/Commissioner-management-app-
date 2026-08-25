# Cloud Run monorepo note: point this service's build/source directory at
# `client/` (not the repo root) — `server/` is a separate Cloud Run
# service with its own Dockerfile.
#
# VITE_API_BASE_URL is compiled into the static bundle at build time (Vite
# env vars aren't readable at runtime), so it must be passed as a build
# arg pointing at the server's URL. That means deploying the server first,
# then building/deploying this image with that URL — see README.md.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist

EXPOSE 8080
# `-s` (single-page app mode) falls back to index.html for any path that
# isn't a real static file, so client-side routing (react-router-dom's
# BrowserRouter) survives a reload or deep link. $PORT is Cloud Run's
# injected listen port.
CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
