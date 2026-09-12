import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Explicit, resumable issue/milestone publication. No Project permissions,
// credentials, assignees, due dates, merges or deployment are modified.
// Default is read-only. Usage: node .../publish-github.mjs --ref COMMIT [--apply]
const root = path.resolve(import.meta.dirname, '../../..');
const directory = path.join(root, 'docs/product/mvp-2026-09/delivery');
const plan = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json'), 'utf8'));
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ref = args[args.indexOf('--ref') + 1];
if (!args.includes('--ref') || !/^[a-f0-9]{40}$/.test(ref ?? '')) throw new Error('Provide an exact pushed --ref COMMIT');
if (plan.repository !== 'Owomide-Engineering/owomide_core') throw new Error('Unexpected repository');
const repo = plan.repository;
const endpoint = `repos/${repo}`;
const marker = id => `<!-- owomide-mvp-2026-09:${id} -->`;
const stateFile = path.join(directory, 'github.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {
  repository: repo, baselineRef: ref, milestones: {}, issues: {},
  project: { status: 'not-created', reason: 'The configured CLI token lacks Projects permission. No scope change or Project write attempted.' }
};
if (state.repository !== repo || state.baselineRef !== ref) throw new Error('Existing publication uses a different repository/baseline; review before proceeding');
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
function api(route, method = 'GET', data) {
  const cmd = ['api', route, '--method', method];
  if (data) cmd.push('--input', '-');
  // gh owns authentication; never extract or print configured credentials.
  return JSON.parse(execFileSync('gh', cmd, { cwd: root, encoding: 'utf8', input: data ? JSON.stringify(data) : undefined }));
}
function list(route) {
  const result = [];
  for (let page = 1; ; page++) {
    const values = api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    result.push(...values);
    if (values.length < 100) return result;
  }
}
const info = api(endpoint);
if (info.private !== true || info.has_issues !== true) throw new Error('Expected private company repository with Issues enabled');
const commit = api(`${endpoint}/commits/${ref}`);
if (commit.sha !== ref) throw new Error('Baseline not available on remote');
const remotePlan = api(`${endpoint}/contents/docs/product/mvp-2026-09/delivery/plan.json?ref=${ref}`);
if (remotePlan.encoding !== 'base64' || !Buffer.from(remotePlan.content, 'base64').equals(fs.readFileSync(path.join(directory, 'plan.json')))) throw new Error('Local plan differs from pushed baseline; publish an exact reviewed checkpoint');
const tree = api(`${endpoint}/git/trees/${commit.commit.tree.sha}?recursive=1`);
if (tree.truncated) throw new Error('Remote tree is truncated; cannot verify publication links');
const paths = new Set(tree.tree.filter(x => x.type === 'blob').map(x => x.path));
for (const file of ['README.md', 'audit/MVP_PRD_BENCHMARK.md', 'audit/REQUIREMENTS_MATRIX.md', 'audit/REQUIREMENTS_MATRIX.json', 'audit/DEVELOPMENT_BACKLOG.md', 'delivery/DECISIONS.md', 'delivery/AGENT_PLAYBOOK.md', 'delivery/requirements-ownership.json', 'source/prototype-prd.pdf', ...plan.issues.map(i => `delivery/issues/${i.id}.md`)]) {
  if (!paths.has(`docs/product/mvp-2026-09/${file}`)) throw new Error(`Missing published evidence path: ${file}`);
}
const existingIssues = list(`${endpoint}/issues?state=all`).filter(x => !x.pull_request);
const existingMilestones = list(`${endpoint}/milestones?state=all`);
const existingLabels = list(`${endpoint}/labels`);
const title = i => `[MVP ${i.id}] ${i.title}`;
const trackerTitle = '[MVP delivery] Accepted PRD → connected pilot';
function resolveIssue(id, expectedTitle, saved) {
  const matches = existingIssues.filter(x => x.title === expectedTitle || x.body?.includes(marker(id)) || x.number === saved?.number);
  if (matches.length > 1) throw new Error(`Ambiguous existing issue ${id}`);
  if (saved && (!matches[0] || matches[0].number !== saved.number || matches[0].html_url !== saved.url)) throw new Error(`Recorded ${id} issue missing or conflicting; review before resuming`);
  if (!saved && matches[0] && !matches[0].body?.includes(marker(id))) throw new Error(`Existing ${id} title is not managed by this plan; review manually`);
  return matches[0];
}
function resolveMilestone(m) {
  const saved = state.milestones[m.id];
  const matches = existingMilestones.filter(x => x.title === m.title || x.number === saved?.number);
  if (matches.length > 1 || (saved && (!matches[0] || matches[0].number !== saved.number))) throw new Error(`Conflicting milestone ${m.id}`);
  return matches[0];
}
const trackerExisting = resolveIssue('tracker', trackerTitle, state.tracker);
const labels = [
  ['mvp:2026-09', '0B3931', 'Accepted September 2026 PRD delivery'],
  ['priority:P0', 'B5473B', 'Correctness, authority, contract or release gate'],
  ['priority:P1', 'B68120', 'Required journey or product capability'],
  ['track:contracts', '745AA5', 'Product decisions and canonical contracts'],
  ['track:frontend', '276B91', 'Explicit sample frontend journey'],
  ['track:backend', '2C6B55', 'Durable service implementation and enforcement'],
  ['track:integration', '466780', 'Connected adapters and acceptance evidence'],
  ['state:ready-for-plan', 'D7EADC', 'Planning only; not ratification or coding approval'],
  ['state:blocked', 'EAD8C2', 'Dependencies/decisions required before coding'],
  ['type:work-package', 'D8DFE7', 'Decompose into bounded child tasks before implementation'],
  ['type:planning-task', 'E0D8EF', 'Draft and ratify bounded decisions/contracts'],
  ['type:delivery-tracker', 'D8E5E1', 'Cross-milestone index; not a feature completion claim']
];
for (const i of plan.issues) {
  const match = resolveIssue(i.id, title(i), state.issues[i.id]);
  if (match && match.state !== 'open') throw new Error(`Existing ${i.id} is closed; do not reopen or overwrite it`);
}
if (trackerExisting && trackerExisting.state !== 'open') throw new Error('Existing tracker is closed; review manually');
for (const m of plan.milestones) {
  const match = resolveMilestone(m);
  if (match && match.state !== 'open') throw new Error(`Milestone ${m.id} is closed; review manually`);
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', repository: repo, baselineRef: ref,
  newLabels: labels.filter(([name]) => !existingLabels.some(x => x.name === name)).length,
  newMilestones: plan.milestones.filter(m => !resolveMilestone(m)).length,
  newWorkItems: plan.issues.filter(i => !resolveIssue(i.id, title(i), state.issues[i.id])).length,
  newTracker: !trackerExisting, project: state.project }, null, 2));
if (!apply) process.exit(0);

for (const [name, color, description] of labels) {
  if (!existingLabels.some(x => x.name === name)) api(`${endpoint}/labels`, 'POST', { name, color, description });
}
for (const m of plan.milestones) {
  const match = resolveMilestone(m);
  if (match && match.state !== 'open') throw new Error(`Milestone ${m.id} is closed; review manually`);
  const result = match ?? api(`${endpoint}/milestones`, 'POST', { title: m.title, description: m.description });
  state.milestones[m.id] = { number: result.number, title: result.title, url: result.html_url };
  save();
}
const link = (file, label) => `[${label}](https://github.com/${repo}/blob/${ref}/docs/product/mvp-2026-09/${file})`;
const overview = `${marker('tracker')}\n## Accepted target and current truth\n\nPreserve the reviewed frontend checkpoint, then deliver the accepted Initiative-led PRD through separate frontend, backend and integration evidence. Current UI is sample-backed; issue creation does not mean implementation.\n\n${link('README.md', 'Delivery hub')} · ${link('audit/MVP_PRD_BENCHMARK.md', 'Accepted benchmark')} · ${link('audit/REQUIREMENTS_MATRIX.md', '379 requirement assessments')} · ${link('delivery/DECISIONS.md', 'Open decisions')}\n\nCT-01/02 are ready for planning only. Other packages remain blocked until their contracts, relevant decisions and dependencies are accepted. Split packages into reviewable child tasks and follow the ${link('delivery/AGENT_PLAYBOOK.md', 'agent playbook')}. Do not claim whole-requirement completion from a frontend demonstration. Backend work may run in parallel by domain after its contract gate.\n\nNo agent is automatically assigned. No dates, deployment, main-branch merge or production operations are authorised by this tracker. GitHub Projects setup is not complete: additional Projects permission is required. Issues and milestones are the active delivery plan.\n`;
const tracker = trackerExisting ?? api(`${endpoint}/issues`, 'POST', { title: trackerTitle, body: overview, labels: ['mvp:2026-09', 'type:delivery-tracker'] });
state.tracker = { number: tracker.number, url: tracker.html_url };
save();
for (const i of plan.issues) {
  for (const d of i.dependsOn) if (!state.issues[d]) throw new Error(`Dependency ${d} must be published before ${i.id}`);
  const dependencyText = i.dependsOn.length ? i.dependsOn.map(d => `- [ ] ${d} — #${state.issues[d].number}`).join('\n') : 'None for drafting. Ratification still requires the named human decider.';
  const body = [marker(i.id), `Delivery tracker: #${tracker.number} · Stable package ID: **${i.id}**`, '',
    `**${i.track} · ${i.priority} · ${i.kind} · ${i.readiness}**`, '',
    '## Outcome', '', i.outcome, '', '## Dependencies and decisions', '', dependencyText, '', i.decisionGate, '',
    'A package is not automatically a one-PR task. Before coding, split it into bounded child tasks where needed and carry over requirement facets. Do not close the parent until its acceptance and dependencies are satisfied.', '',
    '## Editable boundary', '', ...i.editableScope.map(p => `- \`${p}\``), '',
    '## Read first', '',
    `- ${link('delivery/issues/' + i.id + '.md', 'Repository brief (accepted baseline)')}`,
    `- ${link('audit/REQUIREMENTS_MATRIX.json', 'Exact requirement wording, pages and code evidence')}`,
    `- ${link('delivery/requirements-ownership.json', 'Frontend/backend/integration ownership ledger')}`,
    `- ${link('delivery/DECISIONS.md', 'Decision register')} and ${link('delivery/AGENT_PLAYBOOK.md', 'agent execution contract')}`,
    `- ${link('audit/DEVELOPMENT_BACKLOG.md', 'Future BDD acceptance pack')}`, '',
    '## BDD acceptance', '', ...i.acceptance.map(a => '- [ ] ' + a), '',
    '## Requirement facets', '', i.ownedRequirements.length ? i.ownedRequirements.join(', ') : 'Cross-cutting decision/contract dependency. Runtime facets remain owned by their implementation and integration packages.', '',
    'Read Must/Should/May/exclusions in the full body. Ownership is not a blanket obligation to build every optional example or proof the whole requirement is done.', '',
    '## Non-goals', '', ...i.nonGoals.map(n => '- ' + n), '',
    '## Verification and handoff', '',
    '- [ ] Contracts and relevant product decisions accepted; dependencies rechecked.',
    '- [ ] Positive and denied/missing/stale/partial/retry cases verified where applicable.',
    '- [ ] UI changes include desktop/mobile/keyboard/open-control/scroll evidence; backend changes include appropriate service/persistence/migration evidence.',
    '- [ ] Exact commands/runtime/results and unrun checks recorded; sample/live boundaries preserved.',
    '- [ ] Requirement evidence facets, known limitations and next dependency documented.',
    '- [ ] Independent review and CI recorded before requesting merge.', '',
    'No feature is completed by opening this issue. No production write, role grant, deployment or automatic merge is authorised.', ''
  ].join('\n');
  const match = resolveIssue(i.id, title(i), state.issues[i.id]);
  // Preserve existing human edits/status on resumed publication. Only new issues
  // receive initial labels/body. The mapping is recovered from the actual API.
  const result = match ?? api(`${endpoint}/issues`, 'POST', { title: title(i), body, milestone: state.milestones[i.milestone].number,
    labels: ['mvp:2026-09', `priority:${i.priority}`, `track:${i.track}`, `state:${i.readiness}`, `type:${i.kind}`] });
  state.issues[i.id] = { number: result.number, url: result.html_url, milestone: i.milestone };
  save();
  console.log(`${i.id}: ${result.html_url}`);
}
const index = plan.milestones.map(m => `## ${m.title}\n\n[Milestone](${state.milestones[m.id].url})\n\n` + plan.issues.filter(i => i.milestone === m.id).map(i => `- [ ] #${state.issues[i.id].number} — ${i.id}: ${i.title}`).join('\n')).join('\n\n');
// Only fill our own newly created tracker; resumed runs preserve edited checklists.
if (!trackerExisting || trackerExisting.body === overview) api(`${endpoint}/issues/${tracker.number}`, 'PATCH', { body: overview + '\n' + index });
state.publishedAt = new Date().toISOString();
save();
console.log(`Published ${Object.keys(state.issues).length} work items; tracker ${state.tracker.url}`);
