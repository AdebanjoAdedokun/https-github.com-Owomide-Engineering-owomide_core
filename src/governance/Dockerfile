FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/governance/package.json ./src/governance/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --filter @owomide/governance... \
    && node -e "require.resolve('@connectrpc/connect-node', { paths: ['/app/src/governance'] })"

COPY src/governance ./src/governance
COPY src/lib/bus/js ./src/lib/bus/js
COPY src/lib/proto ./src/lib/proto

RUN pnpm --filter @owomide/bus build && pnpm --filter @owomide/governance build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/governance/package.json ./src/governance/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/

RUN pnpm install --frozen-lockfile --filter @owomide/governance... --prod \
    && node -e "require.resolve('@connectrpc/connect-node', { paths: ['/app/src/governance'] })"

COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/lib/bus/js/dist ./src/lib/bus/js/dist
COPY --from=builder /app/src/governance/dist ./src/governance/dist

EXPOSE 50054 8080
CMD ["node", "src/governance/dist/server.js"]
