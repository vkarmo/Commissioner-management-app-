# Cloud Run monorepo note: when configuring this service's build (Cloud
# Run "Continuously deploy from a repository", or `gcloud run deploy
# --source`), point the build/source directory at `server/` — this
# Dockerfile is not meant to be built from the repo root, since `client/`
# is a separate Cloud Run service with its own Dockerfile.

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
