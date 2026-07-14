import fs from 'node:fs';
import { projectRoot, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence } from '../lib/checks.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadActiveChange, isGovernedTarget } from '../lib/gates.mjs';

const root = projectRoot();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (raw) {
  try {
    const event = JSON.parse(raw);
    const filePath = event.tool_input?.file_path || event.tool_input?.path;
    if (filePath) {
      const target = path.resolve(filePath);
      if (isGovernedTarget(root, target)) {
        const active = loadActiveChange(root);
        if (active.ok && active.data.validation) {
          active.data.validation.status = 'stale';
          fs.writeFileSync(active.statePath, JSON.stringify(active.data, null, 2) + '\n', 'utf-8');
        }
      }
    }
  } catch {}
}
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
