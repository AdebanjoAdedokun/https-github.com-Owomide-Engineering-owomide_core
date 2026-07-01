FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/lib/bus-smoke/package.json ./src/lib/bus-smoke/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --filter @owomide/bus-smoke...

COPY src/lib/proto ./src/lib/proto
COPY src/lib/bus/js ./src/lib/bus/js
COPY src/lib/bus-smoke ./src/lib/bus-smoke

RUN pnpm --filter @owomide/bus build
RUN pnpm --filter @owomide/bus-smoke build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/lib/bus-smoke/package.json ./src/lib/bus-smoke/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/

RUN pnpm install --frozen-lockfile --filter @owomide/bus-smoke... --prod

COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/lib/bus/js/dist ./src/lib/bus/js/dist
COPY --from=builder /app/src/lib/bus-smoke/dist ./src/lib/bus-smoke/dist

EXPOSE 5100
CMD ["node", "src/lib/bus-smoke/dist/subscriber.js"]
