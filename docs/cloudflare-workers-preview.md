# Cloudflare Workers builds for the two frontends

This is the current **static sample frontend** hosting path. It does not deploy
Gateway or backend services and does not release the live workspace adapter.
The separate Kubernetes release path is documented in
[frontend deployment](frontend-deployment.md).

## Monorepo settings

Both Workers connect to `Owomide-Engineering/owomide_core`, use repository root
`/`, and keep `main` as the production branch. The two app-local Wrangler files
select different Worker names and resolve assets from their own `dist/` folders.

| Worker | Build command | Production deploy command | Non-production Version command |
| --- | --- | --- | --- |
| `owomide-marketing` | `pnpm install && pnpm --filter @owomide/marketing build` | `npx wrangler deploy -c apps/marketing/wrangler.toml` | `npx wrangler versions upload -c apps/marketing/wrangler.toml` |
| `owomide-workspace` | `pnpm install && pnpm --filter @owomide/workspace build` | `npx wrangler deploy -c apps/workspace/wrangler.toml` | `npx wrangler versions upload -c apps/workspace/wrangler.toml` |

The workspace build variable remains `VITE_WORKSPACE_MODE=fixture`. Credentials
stay in Cloudflare; do not copy token values into this file or application code.

The app-specific `-c` is required on **both** upload paths. There is deliberately
no root Wrangler file choosing one frontend for the whole monorepo. Do not
change the root directory without reviewing dependency installation, build
paths and configuration together.

Cloudflare replaces the production command with the Version command for
non-production branches. `versions upload` creates a preview version without
promoting it to production; do not replace it with `deploy` to make a PR build
pass. See the official [Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
and [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

## September 12 build failure

The PR #77 checkpoint at `d5bf31e` compiled both applications successfully in
Cloudflare. The following upload stage failed with:

```text
Missing entry-point to Worker script or to assets directory
```

The preview command was the default `npx wrangler versions upload`, executed
from `/`, so neither app configuration was selected. The two Version commands
were corrected to the explicit paths above. Production commands, branch rules,
root directories, credentials and workspace fixture mode were left unchanged.
Changing a setting alone is not evidence that the next preview succeeded.

Two independent GitHub CI failures were also identified during that checkpoint:

- Lint selected floating Go `stable` (1.27.1), while golangci-lint 2.12.2 was
  built with Go 1.26.2 and could not parse newer standard-library syntax. The
  same failure already existed on `main`. Lint now selects the Margin
  `go.mod` toolchain like the passing backend Test job; no linter is disabled.
- Keyboard tests could focus actions before asynchronous page-arrival focus
  settled. The revision and protected-tab tests now wait for result-header
  focus before asserting their own focus and sending keyboard input. The
  adjustment helper also settles form initialization and verifies the exact
  edited value and enabled Save action. Application behaviour, timeouts and
  required assertions remain unchanged.

Local verification also exposed a Preview remediation assertion that treated a
new URL as proof that the new data had rendered. It now awaits the exact new
Eligible count and selected tab after each immutable-version transition.
The role-switch helper waits for the authority panel's scheduled focus return
before opening a confirmation; confirmation assertions await the modal's mount
effect. These checks retain the required keyboard and focus behaviour.

The local canonical-fixture comparison requires an external checkout. On a
clean GitHub runner it is explicitly skipped, not passed; interpret CI test
counts accordingly. See PR #77 for the current check results rather than
inferring a successful hosted build from this diagnosis.

## Verification and release boundaries

1. Run `pnpm check:frontends` using the repository-supported Node/pnpm versions.
2. For a feature-branch push, inspect **both** GitHub Workers build checks and
   confirm the build commit and explicit app configuration in the upload log.
3. Open the generated version preview, not a cached production URL. Check asset
   loading and relevant SPA routes. Paired preview navigation requires explicit
   `VITE_WORKSPACE_URL` and `VITE_MARKETING_URL` destinations. Marketing defaults
   to the production workspace; the workspace's hostname substitution cannot
   reliably pair independent per-version IDs. Do not infer a working cross-app
   preview journey from two successful uploads or weaken authentication to
   compensate.
4. Keep PR CI and actual hosting success separate. A local Vite build does not
   verify an upload, token permission or hosted route.
5. Merge/production promotion remains a separate authorised operation. A PR
   preview does not mean the missing PRD backend/integration work is delivered.

If a failure concerns permission or authentication, stop at that boundary.
Do not replace tokens, expand scopes, expose runtime secrets or retry production
deployment as a workaround.
