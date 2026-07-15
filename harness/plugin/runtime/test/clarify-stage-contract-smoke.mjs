import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'staged-workflow.md');
const skillPath = path.join(repoRoot, '.claude', 'skills', 'harness', 'SKILL.md');
const requiredSpecTokens = [
  'clarify',
  '→ route',
  '→ design',
  '→ plan',
  '→ tdd',
  '→ verify',
  '`requirements.md`',
  '/harness',
  'Exploration Packet',
  '`workflow`',
  '`clarifyReady`',
  '`userConfirmedScope`',
  '`planReady`',
  '`tddStatus`',
  '`nextEntry`',
];
const requiredSkillTokens = [
  'clarify-first staged workflow',
  'clarify / route / design / plan / tdd / verify / archive',
  '先进入 `clarify`',
  'workflow.stage',
  'workflow.clarifyReady',
  'workflow.userConfirmedScope',
];

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const specText = readText(specPath);
const skillText = readText(skillPath);
const specOk = requiredSpecTokens.every((token) => specText.includes(token));
const skillOk = requiredSkillTokens.every((token) => skillText.includes(token));

if (mode === 'red') {
  if (!specOk || !skillOk) {
    fail('Expected staged workflow contract to define clarify-first phases and durable artifact boundaries');
  }
  pass('Red precondition no longer holds.');
}

if (!specOk) {
  fail('Expected staged-workflow spec to define clarify-first phases, requirements.md, and exploration packet contract');
}
if (!skillOk) {
  fail('Expected /harness skill to advertise clarify-first stage routing');
}

pass(mode === 'green' ? 'Green clarify-stage contract smoke passed.' : 'Clarify-stage contract verify smoke passed.');
