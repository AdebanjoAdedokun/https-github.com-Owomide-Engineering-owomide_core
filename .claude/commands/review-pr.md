Run the Definition of Done checklist against the current branch before opening a PR.

1. Check the feature ID from the branch name (format: `agent/<service>-<feature-id>`)
2. Read BUILD_PLAN.md to find the DoD for this feature
3. Run through the universal DoD checklist:
   - [ ] Contract committed (proto / event schema as applicable)
   - [ ] DB migration committed (if schema changed), with rollback tested
   - [ ] Implementation complete
   - [ ] Unit tests for pure logic
   - [ ] Integration test (real Postgres, real Kafka)
   - [ ] CLAUDE.md updated where behavior or contract shifted
   - [ ] `make lint` clean
   - [ ] `bazel test //...` green
   - [ ] PR description references the feature ID and DoD checkboxes
4. Run the relevant specialized agent(s) from `.claude/agents/` based on what changed
5. Report any gaps before the PR is opened
