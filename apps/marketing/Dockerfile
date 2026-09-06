# Build with the monorepo root as context:
# docker build -f apps/marketing/Dockerfile -t owomide-marketing .
FROM node:24-alpine AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/marketing/package.json apps/marketing/package.json
RUN pnpm install --frozen-lockfile --filter @owomide/marketing...

COPY apps/marketing apps/marketing

ARG VITE_WORKSPACE_URL
ENV VITE_WORKSPACE_URL=${VITE_WORKSPACE_URL}

RUN pnpm --filter @owomide/marketing build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY apps/marketing/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/marketing/dist /usr/share/nginx/html

EXPOSE 8080
