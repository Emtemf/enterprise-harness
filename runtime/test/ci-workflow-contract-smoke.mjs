import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowDir = path.join(root, '.github', 'workflows');

const workflows = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/u.test(name)).sort();
assert.ok(workflows.length > 0, 'repository must define CI workflows');

// `node <script>` in a workflow step resolves against the checkout root, so a
// path that no longer exists fails only on CI. 0.3.2 moved harness/plugin/runtime
// to runtime/ and left every workflow pointing at the old path.
const nodeInvocation = /\bnode\s+((?:[\w.@/-]+\/)*[\w.-]+\.mjs)/gu;
const npmScript = /\bnpm\s+run\s+([\w:-]+)/gu;

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const missing = [];
for (const workflow of workflows) {
  const text = fs.readFileSync(path.join(workflowDir, workflow), 'utf-8');
  for (const [, script] of text.matchAll(nodeInvocation)) {
    if (!fs.existsSync(path.join(root, script))) missing.push(`${workflow}: node ${script}`);
  }
  for (const [, script] of text.matchAll(npmScript)) {
    if (!pkg.scripts?.[script]) missing.push(`${workflow}: npm run ${script}`);
  }
}
assert.deepEqual(missing, [], `CI workflow references a target that does not exist:\n${missing.join('\n')}`);

// A job that cannot pass on this repository trains maintainers to read red as
// normal, which is how 20 consecutive real failures went unnoticed. ossf/scorecard
// needs GraphQL access GitHub only grants on public repositories, and
// dependency-review needs the dependency graph GitHub only grants publicly or
// under Advanced Security, so both must be gated on visibility rather than left
// permanently failing.
const visibilityGated = ['ossf/scorecard-action', 'actions/dependency-review-action'];
const ungated = [];
for (const workflow of workflows) {
  const text = fs.readFileSync(path.join(workflowDir, workflow), 'utf-8');
  for (const action of visibilityGated) {
    if (!text.includes(action)) continue;
    const job = text.split(action)[0].split(/^  \w[\w-]*:$/mu).pop();
    if (!/github\.event\.repository\.private\s*==\s*false/u.test(job)) ungated.push(`${workflow}: ${action}`);
  }
}
assert.deepEqual(ungated, [], `public-repository-only action must be gated on visibility:\n${ungated.join('\n')}`);

console.log(`PASS ci-workflow-contract ${mode} (${workflows.length} workflows)`);
