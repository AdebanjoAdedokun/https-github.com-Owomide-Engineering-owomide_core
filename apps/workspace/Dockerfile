# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workspace/package.json apps/workspace/package.json
RUN pnpm install --frozen-lockfile --filter @owomide/workspace...

COPY apps/workspace apps/workspace

ARG VITE_WORKSPACE_MODE=fixture
ARG VITE_API_BASE_URL=/api
ARG VITE_MARKETING_URL
ARG VITE_LOGOUT_URL
ARG VITE_FIXTURE_LATENCY_MS=0
ENV VITE_WORKSPACE_MODE=$VITE_WORKSPACE_MODE \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_MARKETING_URL=$VITE_MARKETING_URL \
    VITE_LOGOUT_URL=$VITE_LOGOUT_URL \
    VITE_FIXTURE_LATENCY_MS=$VITE_FIXTURE_LATENCY_MS

RUN pnpm --filter @owomide/workspace build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY apps/workspace/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/workspace/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
