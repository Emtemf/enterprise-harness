import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-release-local-'));
const worktree = path.join(tempRoot, 'repo');
const localAdapterPath = path.join(tempRoot, 'local-adapter.json');
const keepTemp = process.argv.includes('--keep-temp');

fs.cpSync(repoRoot, worktree, {
  recursive: true,
  filter(src) {
    const rel = path.relative(repoRoot, src);
    if (!rel) return true;
    const top = rel.split(path.sep)[0];
    return !['.git', 'node_modules'].includes(top);
  },
});

function run(args) {
  const child = spawnSync('node', ['harness/plugin/runtime/cli.mjs', ...args], {
    cwd: worktree,
    encoding: 'utf-8',
    env: {
      ...process.env,
      HARNESS_LOCAL_ADAPTER: localAdapterPath,
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

run(['bootstrap']);
run(['setup-local-adapter', '--write']);
run(['doctor', '--json']);
run(['sync', '--json']);
run(['verify']);
run(['upstream-check', '--json']);

console.log('Local release smoke complete.');
if (keepTemp) {
  console.log(`Preserved temp directory: ${tempRoot}`);
} else {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
