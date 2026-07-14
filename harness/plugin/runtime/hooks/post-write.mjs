import { projectRoot, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence } from '../lib/checks.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = projectRoot();
const problems = [
  ...validateStructure(root).map((m) => `${m.kind}:${m.path}`),
  ...validateArtifactStates(root),
  ...validateReviewVerdicts(root),
  ...validateChangeEvidence(root),
];
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
for (const rel of ['hooks/validate-openapi.sh', 'hooks/validate-controller-consistency.sh']) {
  const full = path.join(root, rel);
  const result = spawnSync('bash', [full], { cwd: root, encoding: 'utf-8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'post-write check failed\n');
    process.exit(result.status ?? 1);
  }
}
console.log('Post-write gate passed. 如有业务完成声明，后续仍需 fresh validation 证据。');
