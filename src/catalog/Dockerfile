FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/catalog/package.json ./src/catalog/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

RUN pnpm install --frozen-lockfile --filter @owomide/catalog...

COPY src/catalog ./src/catalog
COPY src/lib/bus/js ./src/lib/bus/js
COPY src/lib/proto ./src/lib/proto

RUN pnpm --filter @owomide/bus build && pnpm --filter @owomide/catalog build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.15.9
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/catalog/package.json ./src/catalog/
COPY src/lib/bus/js/package.json ./src/lib/bus/js/
COPY src/lib/proto/package.json ./src/lib/proto/

RUN pnpm install --frozen-lockfile --filter @owomide/catalog... --prod

COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/lib/bus/js/dist ./src/lib/bus/js/dist
COPY --from=builder /app/src/catalog/dist ./src/catalog/dist

EXPOSE 50052 8080
CMD ["node", "src/catalog/dist/server.js"]
