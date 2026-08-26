# Combined single-service deployment: one Cloud Run service runs the
# Express API and serves the built React app from the same origin (see
# server/src/app.ts's static-file block). Deploy with:
#   gcloud run deploy commissionerappservice --source . --region YOUR_REGION ...
#
# Prefer two separate services instead? server/Dockerfile and
# client/Dockerfile still exist for that — see README.md. Don't build
# both this file and those from the same trigger/service; pick one
# deployment shape.

FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/. .
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
# server/src/app.ts serves this directory (and falls back to its
# index.html for client-side routes) only when it exists, so this one
# COPY is what turns "API only" into "API + served frontend".
COPY --from=client-build /app/client/dist ./public

# Cloud Run injects PORT at runtime (default 8080); server/src/config/env.ts
# already reads process.env.PORT, so no hardcoding needed here.
EXPOSE 8080
CMD ["node", "dist/index.js"]
