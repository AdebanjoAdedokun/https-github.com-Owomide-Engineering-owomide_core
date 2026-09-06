# Owómidé workspace

Authenticated pricing, proposal, approval, publication and audit workspace.

## Local development

From the monorepo root:

```sh
pnpm install
pnpm dev:workspace
```

The Vite app listens on `http://localhost:4174`. Browser calls to `/api` proxy
to `WORKSPACE_DEV_GATEWAY_URL` (default `http://127.0.0.1:5000`). The checked-in
fixture repository remains the safe default and makes no live-write claim.

Copy `.env.example` to a local ignored environment file only when a value needs
to change. Canonical local, staging and production destinations are derived from
the current host so the same tested image can be promoted unchanged.

## Connection boundary

`src/data/workspaceRepositories.js` is the transport-neutral composition seam.
`VITE_WORKSPACE_MODE=live` currently fails closed and renders an explicit
unavailable boundary because the generated Gateway adapter and its backend exit
gates are not released. Do not replace fixture mode with ad-hoc `fetch` calls in
components; connect the generated adapter behind the repository factory.

## Verification

```sh
pnpm --filter @owomide/workspace test:all
pnpm --filter @owomide/workspace build
```

The production image serves the SPA from unprivileged nginx on port `8080`.
Ingress must route same-origin `/api` requests to Gateway before the frontend
service; nginx deliberately returns `404` if an API request reaches the SPA.
