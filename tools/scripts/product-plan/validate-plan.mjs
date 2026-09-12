import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '../../..');
const base = path.join(root, 'docs/product/mvp-2026-09');
const read = name => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const plan = read('delivery/plan.json');
const requirements = read('audit/REQUIREMENTS_MATRIX.json');
const ownership = read('delivery/requirements-ownership.json');
const manifest = read('source/manifest.json');
const fingerprint = read('audit/AUDIT_FINGERPRINT.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(path.join(base, 'source', manifest.source)), manifest.sha256, 'Exact PRD bytes must be retained');
assert.equal(requirements.length, 379);
assert.equal(ownership.length, requirements.length);
assert.equal(plan.issues.length, 26);
assert.equal(plan.milestones.length, 4);
const ids = new Set(plan.issues.map(i => i.id));
const requirementIds = new Set(requirements.map(r => r.id));
assert.equal(ids.size, plan.issues.length);
assert.equal(requirementIds.size, requirements.length);
assert.equal(new Set(ownership.map(r => r.requirementId)).size, requirements.length);
for (const row of ownership) {
  assert(requirementIds.has(row.requirementId));
  for (const field of ['frontendOwner', 'backendOwner', 'integrationOwner', 'finalDispositionOwner']) assert(ids.has(row[field]), `${row.requirementId}: ${field}`);
}
const lookup = new Map(plan.issues.map(i => [i.id, i]));
function visit(id, stack = new Set()) {
  assert(!stack.has(id), `Dependency cycle at ${id}`);
  assert(lookup.has(id), `Unknown dependency ${id}`);
  for (const dep of lookup.get(id).dependsOn) visit(dep, new Set(stack).add(id));
}
for (const issue of plan.issues) {
  visit(issue.id);
  assert(plan.milestones.some(m => m.id === issue.milestone));
  assert(issue.editableScope.length && issue.acceptance.length && issue.nonGoals.length);
  assert.equal(issue.readiness, issue.track === 'contracts' ? 'ready-for-plan' : 'blocked');
  const expected = ownership.filter(r => [r.frontendOwner, r.backendOwner, r.integrationOwner].includes(issue.id)).map(r => r.requirementId).sort();
  assert.deepEqual([...issue.ownedRequirements].sort(), expected, `${issue.id}: facet ownership mismatch`);
  assert(fs.existsSync(path.join(base, 'delivery/issues', issue.id + '.md')));
}
assert.equal(fingerprint.screenshots.length, 8);
for (const shot of fingerprint.screenshots) assert.equal(hash(path.join(base, 'audit/screenshots', shot.name)), shot.sha256, shot.name);
let markdownLinks = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(md|json|txt)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert(!/\/Users\/|\/var\/folders\//.test(text), `Non-portable local path in ${file}`);
    if (!file.endsWith('.md')) continue;
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^[a-z]+:|^#/.test(target)) continue;
      const clean = decodeURI(target.split('#')[0]);
      assert(fs.existsSync(path.resolve(path.dirname(file), clean)), `${path.relative(root, file)}: broken link ${target}`);
      markdownLinks++;
    }
  }
}
walk(base);
const ghFile = path.join(base, 'delivery/github.json');
if (fs.existsSync(ghFile)) {
  const github = JSON.parse(fs.readFileSync(ghFile, 'utf8'));
  assert.equal(github.repository, plan.repository);
  assert.match(github.baselineRef, /^[a-f0-9]{40}$/);
  assert.equal(Object.keys(github.issues).length, 26);
  assert.equal(Object.keys(github.milestones).length, 4);
  const numbers = new Set();
  for (const [id, issue] of Object.entries(github.issues)) {
    assert(ids.has(id));
    assert(!numbers.has(issue.number));
    numbers.add(issue.number);
    assert.equal(issue.url, `https://github.com/${plan.repository}/issues/${issue.number}`);
  }
  assert(github.tracker?.number && !numbers.has(github.tracker.number));
}
console.log(JSON.stringify({ requirements: 379, packages: 26, milestones: 4, dependencyGraph: 'acyclic', markdownLinks, sourceHash: 'verified', screenshotHashes: '8 verified', githubLedger: fs.existsSync(ghFile) ? 'verified' : 'not yet published' }, null, 2));
