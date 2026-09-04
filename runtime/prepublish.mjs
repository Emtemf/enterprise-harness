import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const controllerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-controller-'));
const childEnv = {
  ...process.env,
  ENTERPRISE_HARNESS_CONTROLLER_ROOT: controllerRoot,
};
delete childEnv.ENTERPRISE_HARNESS_SESSION_ID;
delete childEnv.CLAUDE_SESSION_ID;
const commands = [
  ['bin/sync-version.mjs', '--check'],
  ['runtime/test/installed-design-plugin-e2e.mjs', 'verify'],
  ['runtime/test/installed-plan-plugin-e2e.mjs', 'verify'],
  ['runtime/test/installed-implement-plugin-e2e.mjs', 'verify'],
  ['bin/run-smoke-suite.mjs'],
  ['runtime/cli.mjs', 'bootstrap'],
  ['runtime/cli.mjs', 'doctor', '--json'],
  ['runtime/cli.mjs', 'sync', '--json'],
  ['runtime/cli.mjs', 'verify', '--release-surface'],
  ['runtime/upstream-check.mjs', '--json'],
  ['runtime/test/docs-consistency-smoke.mjs', 'verify'],
];

function run(command, args) {
  const child = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: childEnv,
  });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  return child.status ?? 1;
}

let status = 0;
try {
  console.log('Enterprise Harness Prepublish Check');
  for (const args of commands) {
    status = run(process.execPath, args);
    if (status !== 0) break;
  }
  if (status === 0) {
    const pluginValidation = spawnSync('claude', ['plugin', 'validate', '.'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: process.platform === 'win32',
      env: childEnv,
    });
    process.stdout.write(pluginValidation.stdout || '');
    process.stderr.write(pluginValidation.stderr || '');
    if (pluginValidation.status !== 0 || /warning/iu.test(`${pluginValidation.stdout || ''}\n${pluginValidation.stderr || ''}`)) {
      console.error('Plugin validation must pass with zero warnings.');
      status = pluginValidation.status || 1;
    }
  }
  if (status === 0) console.log('Prepublish check complete.');
} finally {
  fs.rmSync(controllerRoot, { recursive: true, force: true });
}
process.exit(status);
