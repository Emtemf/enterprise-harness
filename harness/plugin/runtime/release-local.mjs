import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const keepTemp = process.argv.includes('--keep-temp');
const help = process.argv.includes('--help') || process.argv.includes('-h');

if (help) {
  console.log('Enterprise Harness Local Release Smoke');
  console.log('Usage: node harness/plugin/runtime/release-local.mjs [--keep-temp]');
  console.log('Runs source-external smoke in a temporary copied repo.');
  process.exit(0);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-release-local-'));
const worktree = path.join(tempRoot, 'repo');
const localAdapterPath = path.join(tempRoot, 'local-adapter.json');

fs.mkdirSync(worktree, { recursive: true });

const archive = spawnSync('git', ['archive', '--format=tar', 'HEAD'], {
  cwd: repoRoot,
  encoding: null,
});
if (archive.status !== 0) {
  process.stderr.write(archive.stderr ? archive.stderr.toString('utf-8') : '');
  process.exit(archive.status ?? 1);
}
const extract = spawnSync('tar', ['-xf', '-', '-C', worktree], {
  cwd: repoRoot,
  encoding: null,
  input: archive.stdout,
});
if (extract.status !== 0) {
  process.stderr.write(extract.stderr ? extract.stderr.toString('utf-8') : '');
  process.exit(extract.status ?? 1);
}

function run(command, args, env = {}) {
  const child = spawnSync(command, args, {
    cwd: worktree,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HARNESS_LOCAL_ADAPTER: localAdapterPath,
      ...env,
    },
  });
  process.stdout.write(child.stdout || '');
  process.stderr.write(child.stderr || '');
  if (child.status !== 0) {
    if (!keepTemp) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    process.exit(child.status ?? 1);
  }
}

console.log('Enterprise Harness Local Release Smoke');
console.log(`Source repo: ${repoRoot}`);
console.log(`Temp repo: ${worktree}`);
console.log(`Temp local adapter: ${localAdapterPath}`);

run('codegraph', ['init']);
run('node', ['harness/plugin/runtime/cli.mjs', 'bootstrap']);
run('node', ['harness/plugin/runtime/cli.mjs', 'setup-local-adapter', '--write']);
run('node', ['harness/plugin/runtime/cli.mjs', 'doctor', '--json']);
run('node', ['harness/plugin/runtime/cli.mjs', 'sync', '--json']);
run('node', ['harness/plugin/runtime/cli.mjs', 'verify']);
run('node', ['harness/plugin/runtime/cli.mjs', 'upstream-check', '--json']);

console.log('Local release smoke complete.');
if (keepTemp) {
  console.log(`Preserved temp directory: ${tempRoot}`);
} else {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
