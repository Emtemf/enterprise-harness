import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { controlledRewind } from '../lib/artifacts.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalFiles = [
  ...fs.readdirSync(path.join(root, 'skills', 'harness', 'references'), { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.join(root, 'skills', 'harness', 'references', entry)),
  path.join(root, 'agents', 'code-explore.md'),
  path.join(root, 'agents', 'doc-research.md'),
  path.join(root, 'skills', 'design', 'SKILL.md'),
  path.join(root, 'skills', 'review', 'SKILL.md'),
];
const forbidden = [
  /route\./u,
  /tdd\.execute-task/u,
  /design-executor/u,
  /plan-executor/u,
  /harness\/behavior-checks\.json/u,
  /handoffVersion:\s*1/u,
  /HANDOFF_RESULT/u,
  /clarifyReady/u,
  /routeReady/u,
  /designApproved/u,
  /planReady/u,
  /tddStatus/u,
];

for (const file of canonicalFiles) {
  const text = fs.readFileSync(file, 'utf-8');
  for (const token of forbidden) {
    assert.equal(token.test(text), false, `${path.relative(root, file)} must not contain ${token}`);
  }
}

for (const legacyStage of ['route', 'tdd']) {
  assert.throws(
    () => controlledRewind({ currentStage: legacyStage, targetStage: 'clarify' }),
    /unknown workflow stage/u,
    `${legacyStage} must not remain a canonical v6 lifecycle stage`,
  );
}

console.log(`PASS reference-architecture ${mode}`);
