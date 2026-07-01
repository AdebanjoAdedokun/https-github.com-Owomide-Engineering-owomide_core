FROM node:24-alpine AS builder
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy workspace manifest, lockfile, and the package.json of every workspace
# package the gateway depends on — pnpm needs the full graph to resolve links.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/
COPY src/lib/proto/package.json ./src/lib/proto/
COPY tsconfig.base.json ./

# Install gateway + its workspace dependency (@owomide/proto) and their deps.
RUN pnpm install --frozen-lockfile --filter @owomide/gateway...

# Bring in sources: the generated proto package and the gateway itself.
COPY src/lib/proto ./src/lib/proto
COPY src/gateway ./src/gateway

RUN pnpm --filter @owomide/gateway build

FROM node:24-alpine
WORKDIR /app

ARG PNPM_VERSION=8.12.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/gateway/package.json ./src/gateway/
COPY src/lib/proto/package.json ./src/lib/proto/

# Production install — links @owomide/proto as a workspace package so its own
# dependency (@bufbuild/protobuf) resolves correctly at runtime.
RUN pnpm install --frozen-lockfile --filter @owomide/gateway... --prod

# Generated proto JS (consumed at runtime) and the compiled gateway.
COPY --from=builder /app/src/lib/proto/gen ./src/lib/proto/gen
COPY --from=builder /app/src/gateway/dist ./src/gateway/dist

EXPOSE 5000
CMD ["node", "src/gateway/dist/server.js"]
