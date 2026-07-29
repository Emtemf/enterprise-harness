import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const commands = [
  ['harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs', 'verify'],
  ['harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs', 'verify'],
  ['harness/plugin/runtime/test/task3-gate-completion-smoke.mjs', 'verify'],
  ['harness/plugin/runtime/test/release-version-acceptance-smoke.mjs', 'verify'],
  ['harness/plugin/runtime/test/current-doc-surface-smoke.mjs', 'verify'],
  ['harness/plugin/runtime/cli.mjs', 'doctor', '--json'],
  ['harness/plugin/runtime/cli.mjs', 'sync', '--json'],
  ['harness/plugin/runtime/cli.mjs', 'verify'],
  ['harness/plugin/runtime/upstream-check.mjs', '--json'],
];

console.log('Enterprise Harness Prepublish Check');
for (const args of commands) {
  const child = spawnSync('node', args, { cwd: repoRoot, encoding: 'utf-8' });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}
const pluginValidation = spawnSync('claude', ['plugin', 'validate', '.'], {
  cwd: repoRoot,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});
process.stdout.write(pluginValidation.stdout || '');
process.stderr.write(pluginValidation.stderr || '');
if (pluginValidation.status !== 0 || /warning/iu.test(`${pluginValidation.stdout || ''}\n${pluginValidation.stderr || ''}`)) {
  console.error('Plugin validation must pass with zero warnings.');
  process.exit(pluginValidation.status || 1);
}
console.log('Prepublish check complete.');
