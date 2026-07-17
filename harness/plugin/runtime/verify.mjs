import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateControllerConsistency } from './lib/checks.mjs';

const root = projectRoot();

const problems = [
  ...validateStructure(root).map((m) => `${m.kind}:${m.path}`),
  ...validateOpenApiLight(root),
  ...validateControllerConsistency(root),
  ...validateArtifactStates(root),
  ...validateReviewVerdicts(root),
  ...validateChangeEvidence(root),
];

const templateDir = path.join(root, 'harness', 'templates');
const todoHits = [];
if (fs.existsSync(templateDir)) {
  for (const name of fs.readdirSync(templateDir)) {
    const full = path.join(templateDir, name);
    const text = fs.readFileSync(full, 'utf-8');
    if (text.includes('TODO') || text.includes('TBD')) {
      todoHits.push(full);
    }
  }
}

const contractChecks = {
  ok: problems.length === 0 && todoHits.length === 0,
  problems,
  todoHits,
};

const runtimeReadinessChecks = {
  ok: false,
  status: 'not-run',
  guidance: [
    'doctor --json',
    'sync --json',
    'upstream-check --json',
  ],
};

const result = {
  repoRoot: root,
  ok: contractChecks.ok,
  contractChecks,
  runtimeReadinessChecks,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Verify');
if (contractChecks.ok) {
  console.log('OK contract checks passed.');
} else {
  for (const p of contractChecks.problems) console.log(`FAIL ${p}`);
  for (const t of contractChecks.todoHits) console.log(`FAIL template-placeholder ${t}`);
}
console.log('runtime readiness requires separate commands: doctor --json, sync --json, upstream-check --json');
process.exit(result.ok ? 0 : 1);
