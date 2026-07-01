FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace manifest and lockfile first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/
COPY tsconfig.base.json ./

# Install only gateway deps (workspace-aware, production + dev for build)
RUN pnpm install --frozen-lockfile --filter @owomide/gateway

COPY src/gateway ./src/gateway

RUN pnpm --filter @owomide/gateway build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/

RUN pnpm install --frozen-lockfile --filter @owomide/gateway --prod

COPY --from=builder /app/src/gateway/dist ./src/gateway/dist

EXPOSE 3000
CMD ["node", "src/gateway/dist/server.js"]
