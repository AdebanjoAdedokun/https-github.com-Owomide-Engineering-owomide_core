FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable

# Copy workspace manifest and lockfile first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/
COPY tsconfig.base.json ./

# Install only gateway deps (workspace-aware, production + dev for build)
RUN pnpm install --frozen-lockfile --filter @owomide/gateway

COPY src/gateway ./src/gateway

RUN pnpm --filter @owomide/gateway build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/

RUN pnpm install --frozen-lockfile --filter @owomide/gateway --prod

COPY --from=builder /app/src/gateway/dist ./src/gateway/dist

EXPOSE 3000
CMD ["node", "src/gateway/dist/server.js"]
