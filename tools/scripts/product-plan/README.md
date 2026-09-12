# Product-plan tooling

Run from the repository root with Node.js 22 or later. These scripts are build-time documentation tools, not application runtime code.

```sh
node tools/scripts/product-plan/build-plan.mjs
node tools/scripts/product-plan/validate-plan.mjs
```

`build-plan.mjs` contains the accepted initial work-package definitions and ownership mapping. It regenerates `delivery/plan.json`, the issue briefs, ownership ledger and index, preserving published links from `delivery/github.json`. Do not use it to erase later delivery evidence: evolve the generator/schema deliberately when work is completed.

The original audit import is a one-time operation requiring explicit source directory/PDF arguments. It verifies the accepted PDF hash, preserves evidence bytes, fixes screenshot extensions and makes links portable. Do not rerun it over amended delivery evidence.

## GitHub publication

Push the checkpoint to a feature branch first. Pass its exact remote commit:

```sh
node tools/scripts/product-plan/publish-github.mjs --ref COMMIT_SHA
```

The default is read-only: it checks repository privacy, commit availability and existing issues, labels and milestones, and prints the planned counts. Only an explicitly authorised run with `--apply` creates missing items. It does not change token scopes, Projects, assignees, due dates, merges or deployments.

Publication records each successful operation in `delivery/github.json` and can resume with the same baseline. Existing issue bodies/labels are preserved, closed packages cause a stop, and references use immutable checkpoint links. After publication, rerun build/validation, inspect the result, commit the link ledger and push normally. New issues alone do not establish implementation readiness or completion.

## Baseline preservation

The archived audit fingerprint records source files at audit time, before packaging. Packaging changed only documentation in that source set: the workspace README gained the delivery-hub link, the journey audit gained portable image links, and the polish brief/table-consistency audit had Markdown hard-break whitespace normalised to blank lines. Their hashes differ intentionally; the dated fingerprint must not be retroactively recomputed. New code changes require their own test/evidence record.
