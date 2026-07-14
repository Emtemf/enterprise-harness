import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const commands = [
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
console.log('Prepublish check complete.');
