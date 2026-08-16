import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createTempSandbox } from '../lib/temp-sandbox.mjs';

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const requiredRuntime = [
  'test/plugin-entry-agent-contract-smoke.mjs',
  'test/portable-launcher-smoke.mjs',
  'test/subagent-contract-smoke.mjs',
];
for (const relative of requiredRuntime) {
  if (!fs.existsSync(path.join(root, 'runtime', relative))) {
    console.error(`FAIL missing Task 2 runtime: ${relative}`);
    process.exitCode = 1;
    break;
  }
}
if (requiredRuntime.some((relative) => !fs.existsSync(path.join(root, 'runtime', relative)))) {
  process.exit(1);
}
const components = [
  'plugin-entry-agent-contract-smoke.mjs',
  'portable-launcher-smoke.mjs',
  'subagent-contract-smoke.mjs',
  'agent-lifecycle-hook-smoke.mjs',
  'route-stage-separation-smoke.mjs',
];
let failed = false;
const sandbox = createTempSandbox('enterprise-harness-task2-suite-');
const childEnv = {
  ...process.env,
  TMPDIR: sandbox.path,
  TMP: sandbox.path,
  TEMP: sandbox.path,
};
try {
  for (const component of components) {
    const result = spawnSync(process.execPath, [
      path.join(root, 'runtime/test', component),
      mode,
    ], {
      cwd: root,
      encoding: 'utf-8',
      env: childEnv,
      shell: false,
    });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) failed = true;
  }
} finally {
  sandbox.cleanup();
}
if (failed) {
  console.error(`FAIL task2-plugin-agent ${mode}`);
  process.exitCode = 1;
} else {
  console.log(`PASS task2-plugin-agent ${mode}`);
}
