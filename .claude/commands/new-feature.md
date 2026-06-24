Use the feature task template to start work on a feature from BUILD_PLAN.md.

Read BUILD_PLAN.md to find the feature by ID (e.g. F2.1, F3.2). Then structure the task as:

**Feature:** <ID> — <name>
**Service:** `src/<service>`
**Read first:** List the relevant CLAUDE.md files and ARCHITECTURE.md sections
**What to build:** One-paragraph description of the deliverable
**Don't build:** Explicitly list adjacent features that are out of scope
**DoD:** Standard checklist from BUILD_PLAN.md §1.3
**Open questions:** None unless discovered during planning

Use Plan Mode (Shift+Tab) before writing any code. Create the branch as `agent/<service>-<feature-id>`.
