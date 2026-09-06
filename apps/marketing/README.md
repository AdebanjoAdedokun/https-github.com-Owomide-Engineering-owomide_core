# Owomide marketing

The approved public landing experience for `owomide.com`.

## Local development

From the monorepo root:

```sh
pnpm --filter @owomide/marketing dev
```

The app listens on `http://localhost:4173`. Its Log in actions resolve to the local workspace at `http://localhost:4174` by default.

Local, staging and production hosts derive the matching workspace destination,
so one tested image can be promoted unchanged. Set `VITE_WORKSPACE_URL` only
for a non-standard preview domain. The app appends
`#/login?returnTo=%2Fwork` to that base URL.

## Validation

```sh
pnpm --filter @owomide/marketing test
pnpm --filter @owomide/marketing build
```

The exported browser BDD scenarios remain in `tests/landing-bdd.browser.mjs` for rendered viewport QA.

## Container

Build from the monorepo root so the shared pnpm lockfile is available:

```sh
docker build \
  -f apps/marketing/Dockerfile \
  -t owomide-marketing .
```

The final image runs unprivileged nginx on port `8080` with an SPA fallback.
