import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const commands = [
  ['bin/run-smoke-suite.mjs'],
  ['runtime/cli.mjs', 'bootstrap'],
  ['runtime/cli.mjs', 'doctor', '--json'],
  ['runtime/cli.mjs', 'sync', '--json'],
  ['runtime/cli.mjs', 'verify'],
  ['runtime/upstream-check.mjs', '--json'],
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
