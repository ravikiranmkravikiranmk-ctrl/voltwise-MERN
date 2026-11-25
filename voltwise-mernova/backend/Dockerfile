# Build context is the repo root so the shared engine workspace is available.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/engine/package.json packages/engine/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json

RUN npm install --omit=dev --workspaces --include-workspace-root --no-audit --no-fund

COPY packages/engine packages/engine
COPY backend backend

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
