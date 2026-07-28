import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const requiredRuntime = [
  'lib/evidence-policy.mjs',
  'lib/agent-evidence.mjs',
  'lib/git-evidence.mjs',
  'lib/tdd-receipts.mjs',
  'tdd-run.mjs',
  'evidence-import.mjs',
  'migrate-evidence-policy.mjs',
  'hooks/pre-agent.mjs',
  'hooks/post-agent.mjs',
  'hooks/subagent-start.mjs',
  'hooks/subagent-stop.mjs',
];
for (const relative of requiredRuntime) {
  if (!fs.existsSync(path.join(root, 'harness/plugin/runtime', relative))) {
    console.error(`FAIL missing Task 1 runtime: ${relative}`);
    process.exit(1);
  }
}
const components = [
  'tdd-receipt-contract-smoke.mjs',
  'evidence-policy-contract-smoke.mjs',
  'agent-lifecycle-hook-smoke.mjs',
];
let failed = false;
for (const component of components) {
  const result = spawnSync('node', [
    path.join(root, 'harness/plugin/runtime/test', component),
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
