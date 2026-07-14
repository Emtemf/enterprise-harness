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

const result = {
  repoRoot: root,
  ok: problems.length === 0 && todoHits.length === 0,
  problems,
  todoHits,
};

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

console.log('Enterprise Harness Verify');
if (problems.length === 0 && todoHits.length === 0) {
  console.log('OK contract and runtime checks passed.');
} else {
  for (const p of problems) console.log(`FAIL ${p}`);
  for (const t of todoHits) console.log(`FAIL template-placeholder ${t}`);
}
process.exit(result.ok ? 0 : 1);
