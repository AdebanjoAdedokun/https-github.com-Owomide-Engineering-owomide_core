FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/rbac/package.json ./src/rbac/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --filter @owomide/rbac... \
    && node -e "require.resolve('@connectrpc/connect-node', { paths: ['/app/src/rbac'] })"

COPY src/rbac ./src/rbac
COPY src/lib/proto ./src/lib/proto

RUN pnpm --filter @owomide/rbac build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/rbac/package.json ./src/rbac/
COPY src/lib/proto/package.json ./src/lib/proto/

RUN pnpm install --frozen-lockfile --filter @owomide/rbac... --prod \
    && node -e "require.resolve('@connectrpc/connect-node', { paths: ['/app/src/rbac'] })"

COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/rbac/dist ./src/rbac/dist

EXPOSE 50056 8080
CMD ["node", "src/rbac/dist/server.js"]
