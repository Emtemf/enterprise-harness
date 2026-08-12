import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillsRoot = path.join(root, 'skills');
const referenceRoot = path.join(skillsRoot, 'harness', 'reference');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const references = fs.readdirSync(referenceRoot, { recursive: true })
  .filter((entry) => entry.endsWith('.md'))
  .map((entry) => `skills/harness/reference/${entry.replaceAll(path.sep, '/')}`)
  .sort();
const skillFiles = [
  'skills/harness/SKILL.md',
  'skills/harness-design/SKILL.md',
  'skills/harness-plan/SKILL.md',
  'skills/harness-tdd/SKILL.md',
  'skills/harness-verify/SKILL.md',
];
const referenceNames = [
  'behavior-map.md',
  'stage-decisions.md',
  'protocol/checker-verdict-contract.md',
  'protocol/checker-verdicts.md',
  'protocol/executor-minimal.md',
  'protocol/executor-result-contract.md',
];
const referencePathVariants = (relative) => [
  `skills/harness/reference/${relative}`,
  `../harness/reference/${relative}`,
];
const corpus = skillFiles.map(read).join('\n');

assert.ok(references.length > 0, 'reference directory must contain markdown contracts');
for (const reference of referenceNames) {
  assert.ok(references.includes(`skills/harness/reference/${reference}`), `missing ${reference}`);
  assert.ok(
    referencePathVariants(reference).some((variant) => corpus.includes(variant)),
    `${reference} must be explicitly wired from a stage skill`,
  );
}
const behaviorMap = read('skills/harness/reference/behavior-map.md');
const registry = JSON.parse(read('harness/behavior-checks.json'));
for (const behavior of Object.keys(registry.behaviors)) {
  assert.ok(behaviorMap.includes(`\`${behavior}\``), `${behavior} missing from behavior-map`);
}

const agentFiles = {
  execute: [
    'code-explore',
    'doc-research',
    'clarify-synthesizer',
    'route-decider',
    'design-executor',
    'plan-executor',
    'tdd-executor',
    'verification-executor',
  ],
  checker: [
    'clarify-reviewer',
    'requirement-reviewer',
    'design-reviewer',
    'plan-critic',
    'api-consistency-reviewer',
    'implementation-reviewer',
    'verification-reviewer',
  ],
};
const agentText = (name) => read(`agents/${name}.md`);
for (const name of agentFiles.execute) {
  assert.ok(
    agentText(name).includes('skills/harness/reference/protocol/executor-result-contract.md'),
    `${name} must point to the executor result contract`,
  );
  assert.ok(
    agentText(name).includes('skills/harness/reference/protocol/executor-minimal.md'),
    `${name} must point to the executor minimal example`,
  );
}
for (const name of agentFiles.checker) {
  assert.ok(
    agentText(name).includes('skills/harness/reference/protocol/checker-verdict-contract.md'),
    `${name} must point to the checker verdict contract`,
  );
  assert.ok(
    agentText(name).includes('skills/harness/reference/protocol/checker-verdicts.md'),
    `${name} must point to the checker verdict examples`,
  );
}

assert.match(read('skills/harness/SKILL.md'), /按需读取 reference/u);
assert.match(read('skills/harness/SKILL.md'), /behavior-map\.md[\s\S]*stage-decisions\.md/u);
assert.match(read('skills/harness-tdd/SKILL.md'), /executor-result-contract\.md[\s\S]*checker-verdict-contract\.md/u);
assert.match(read('skills/harness-verify/SKILL.md'), /checker-verdicts\.md/u);

console.log(`PASS reference-wiring-contract verify (${references.length} references)`);
