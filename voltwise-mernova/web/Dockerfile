# Build context is the repo root so the shared engine workspace is available.
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/engine/package.json packages/engine/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json

RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

COPY packages/engine packages/engine
COPY web web

RUN npm run build --workspace=web

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
