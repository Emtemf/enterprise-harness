import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
console.log('Enterprise Harness Install');
console.log(`Repo: ${repoRoot}`);

const bootstrap = spawnSync('node', ['harness/plugin/runtime/bootstrap.mjs'], { cwd: repoRoot, encoding: 'utf-8' });
process.stdout.write(bootstrap.stdout || '');
process.stderr.write(bootstrap.stderr || '');
if (bootstrap.status !== 0) {
  process.exit(bootstrap.status ?? 1);
}

const setupArgs = ['harness/plugin/runtime/setup-local-adapter.mjs'];
if (process.argv.includes('--write-local-adapter')) {
  setupArgs.push('--write');
}
const setup = spawnSync('node', setupArgs, { cwd: repoRoot, encoding: 'utf-8' });
process.stdout.write(setup.stdout || '');
process.stderr.write(setup.stderr || '');
if (setup.status !== 0) {
  process.exit(setup.status ?? 1);
}

console.log('Next: run node harness/plugin/runtime/doctor.mjs');
