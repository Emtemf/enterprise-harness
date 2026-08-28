import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const skillDir = path.join(root, 'skills', 'design');
const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
const reviewRubric = fs.readFileSync(path.join(root, 'skills/review/references/design.md'), 'utf-8');
const behaviorMap = fs.readFileSync(path.join(root, 'skills/harness/references/behavior-map.md'), 'utf-8');
const designRuntimeScripts = [
  fs.readFileSync(path.join(skillDir, 'scripts/prepare-input.mjs'), 'utf-8'),
  fs.readFileSync(path.join(skillDir, 'scripts/finalize-result.mjs'), 'utf-8'),
].join('\n');

assert.match(skill, /^agent: enterprise-harness:artifact-worker$/mu);
assert.doesNotMatch(skill, /^background:/mu, 'background is agent frontmatter, not Skill frontmatter');
assert.match(skill, /^context: fork$/mu);
assert.match(skill, /^argument-hint: HANDOFF_INPUT=<canonical-input\.json-path>$/mu);
assert.match(skill, /\$ARGUMENTS/u);
assert.match(skill.replaceAll('$ARGUMENTS', 'HANDOFF_INPUT=.git/enterprise-harness/runs/c/run/input.json'), /HANDOFF_INPUT=/u);
assert.doesNotMatch(designRuntimeScripts, /runtime\/(?:lib|core)\//u, 'Skill scripts must import runtime only through runtime/api');
for (const file of [
  'references/method.md',
  'references/artifact-contract.md',
  'references/self-check.md',
  'references/api-design.md',
  'references/data-design.md',
  'references/quality-design.md',
  'references/examples.md',
  'scripts/prepare-input.mjs',
  'scripts/finalize-result.mjs',
  'assert/artifact-shape.mjs',
  'assert/requirement-coverage.mjs',
  'assert/traceability.mjs',
]) {
  assert.equal(fs.existsSync(path.join(skillDir, file)), true, `missing ${file}`);
  assert.match(skill, new RegExp('`' + file.replaceAll('.', '\\.') + '`', 'u'), `SKILL.md must wire ${file}`);
}

for (const concern of ['交互与失败路径', '安全', 'observability', '技术债', 'alternatives']) {
  assert.match(reviewRubric, new RegExp(concern, 'iu'), `design review rubric must cover ${concern}`);
}

for (const handoffContract of [
  'handoff create',
  'design design.produce execute',
  '--input-ref harness/changes/<change-id>/requirements.md',
  '--input-ref <classification-ref>',
  'HANDOFF_INPUT=',
  'enterprise-harness:design',
]) {
  assert.match(behaviorMap, new RegExp(handoffContract.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), `controller must wire ${handoffContract}`);
}

console.log(`PASS design-skill-wiring ${mode}`);
