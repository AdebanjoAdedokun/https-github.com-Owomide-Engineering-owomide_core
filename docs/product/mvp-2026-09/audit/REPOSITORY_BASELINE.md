# MVP PRD benchmark: verified source baseline

Checked 12 September 2026. The original incomplete intake is superseded by the replacement described below. Read this with the completed benchmark, not as an onboarding approval.

## Frontend working baseline

- Working checkout: `owomide_core`.
- Branch: `polish/workspace-premium-desk`.
- HEAD: `67218abda3e2302bd3003075910cc3a5bfc02097` plus substantial uncommitted frontend implementation/polish and test/documentation files.
- Existing edits were preserved. No commits, resets, stashes, branch switches, deployment or application-code changes were performed for this intake.
- This benchmark assesses the actual working frontend, not just committed `main`. The hosted Cloudflare build was not compared or certified.

## Backend freshness check

- Configured remote: `https://github.com/Owomide-Engineering/owomide_core.git`.
- `git fetch origin` completed successfully; its fetch refspec covers all remote branches.
- `git ls-remote --heads origin` independently confirmed `main` at `67218abda3e2302bd3003075910cc3a5bfc02097`.
- `git pull --ff-only origin main` completed with **Already up to date**.
- The `main` tip is the 6 September 2026 merge of PR #49, Cloudflare Workers asset configuration.
- `gh pr list --repo Owomide-Engineering/owomide_core --state open --limit 100` returned an empty list.
- Following the user's instruction to check main or the engineer's recent branch, all published `joshua/*` refs were checked for commits absent from main. The latest feature branch is `joshua/governance-F6.4`, `b32c961`, 26 July 2026, already merged. All other Joshua refs also have zero commits ahead of main except `joshua/ci-F0.7`: one 1 July 2026 commit (`e27157a`) changing the pnpm setup action version in two CI YAML files. It contains no roles/permissions work.
- No newer published roles/permissions implementation was found in this remote. This does not mean the engineer has done no work: it may be unpushed or elsewhere. The benchmark includes the verified current main implementation and identifies the uncertainty explicitly; no speculative branch was merged.
- The separate `owomide_core` directory is an older documentation worktree. Backend evidence in this audit comes from `owomide-frontend-monorepo/src`, which matches the fetched main backend.

## Replacement PRD

- Path: `source/prototype-prd.pdf`.
- 283 physical PDF pages; 2,330,079 bytes.
- SHA-256: `0abae9e27c514a8f0bdef9bd344d1f5eb75f033fb61495f7ebcc6a225c7ceba3`.
- 379 numbered requirements across 14 capability areas, plus foundation, lifecycle, scope and interpretation sections.
- Page references use one-based physical PDF pages, including divider pages. Text was extracted with Poppler and key pages were rendered to verify semantics and tables.
- Earlier one-page source: 33,659 bytes, hash `d13d0b602f3dcde1fe8f0914492f34105e0d7a76b4ef357f7ea9122df4e556db`. Its blocker no longer applies.

## Evidence limits

Local source review, local sample UI captures and safe isolated tests establish code and prototype evidence, not deployed backend readiness. No customer data was imported, no price was published, no permissions were changed, and no production infrastructure was exercised. Existing application changes were preserved; only audit artifacts were authored. Must/Should/May follow PRD pp73–74; illustrative examples do not silently expand scope. No feature-count completion percentage is used.
