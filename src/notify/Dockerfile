FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/notify/package.json ./src/notify/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --filter @owomide/notify... \
    && node -e "require.resolve('pg', { paths: ['/app/src/notify'] })"

COPY src/notify ./src/notify
COPY src/lib/bus/js ./src/lib/bus/js
COPY src/lib/proto ./src/lib/proto

RUN pnpm --filter @owomide/bus build && pnpm --filter @owomide/notify build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/notify/package.json ./src/notify/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/

RUN pnpm install --frozen-lockfile --filter @owomide/notify... --prod \
    && node -e "require.resolve('pg', { paths: ['/app/src/notify'] })"

COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/lib/bus/js/dist ./src/lib/bus/js/dist
COPY --from=builder /app/src/notify/dist ./src/notify/dist

USER node
EXPOSE 8080
CMD ["node", "src/notify/dist/server.js"]
