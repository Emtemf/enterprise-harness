import process from 'node:process';
import { spawnSync } from 'node:child_process';

const help = process.argv.includes('--help') || process.argv.includes('-h');
const repoRoot = process.cwd();

if (help) {
  console.log('Enterprise Harness Update');
  console.log('Usage: node harness/plugin/runtime/update.mjs');
  console.log('Runs sync, doctor, and upstream-check for the current repo.');
  process.exit(0);
}

console.log('Enterprise Harness Update');

for (const args of [
  ['harness/plugin/runtime/sync.mjs'],
  ['harness/plugin/runtime/doctor.mjs'],
  ['harness/plugin/runtime/upstream-check.mjs'],
]) {
  const child = spawnSync('node', args, { cwd: repoRoot, encoding: 'utf-8' });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    process.exit(child.status ?? 1);
  }
}

console.log('Update check complete.');
