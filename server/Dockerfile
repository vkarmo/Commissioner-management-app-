# Cloud Run monorepo note: deploy with `gcloud run deploy --source server`
# (see README.md) — this Dockerfile is not meant to be built from the
# repo root, since `client/` is a separate Cloud Run service with its own
# Dockerfile. Cloud Run's "Create Service from repository" Console wizard
# doesn't support pointing at a subdirectory of a monorepo; use the CLI.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Cloud Run injects PORT at runtime (default 8080); src/config/env.ts
# already reads process.env.PORT, so no hardcoding needed here.
EXPOSE 8080
CMD ["node", "dist/index.js"]
