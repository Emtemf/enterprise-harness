import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const requiredRuntime = [
  'runtime/lib/evidence-policy.mjs',
  'runtime/lib/agent-evidence.mjs',
  'runtime/lib/git-evidence.mjs',
  'runtime/lib/tdd-receipts.mjs',
  'runtime/tdd-run.mjs',
  'runtime/evidence-import.mjs',
  'runtime/migrate-evidence-policy.mjs',
  'hooks/scripts/pre-agent.mjs',
  'hooks/scripts/post-agent.mjs',
  'hooks/scripts/subagent-start.mjs',
  'hooks/scripts/subagent-stop.mjs',
];
for (const relative of requiredRuntime) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`FAIL missing Task 1 runtime: ${relative}`);
    process.exit(1);
  }
}
const components = [
  'tdd-receipt-contract-smoke.mjs',
  'tdd-run-baseline-smoke.mjs',
  'evidence-policy-contract-smoke.mjs',
  'agent-lifecycle-hook-smoke.mjs',
  'failed-dispatch-recovery-smoke.mjs',
  'evidence-import-adversarial-smoke.mjs',
];
let failed = false;
for (const component of components) {
  const result = spawnSync('node', [
    path.join(root, 'runtime/test', component),
    mode,
  ], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) failed = true;
}
if (failed) {
  console.error(`FAIL task1-authoritative-evidence ${mode}`);
  process.exit(1);
}
console.log(`PASS task1-authoritative-evidence ${mode}`);
