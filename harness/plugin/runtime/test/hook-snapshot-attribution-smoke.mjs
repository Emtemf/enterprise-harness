import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  captureGovernedSnapshot,
  diffGovernedSnapshots,
} from '../lib/hook-snapshots.mjs';

const mode = process.argv[2] || 'verify';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hook-snapshot-'));
const javaRoot = path.join(root, 'src', 'main', 'java', 'demo');

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
}

function write(name, content) {
  fs.mkdirSync(javaRoot, { recursive: true });
  fs.writeFileSync(path.join(javaRoot, name), content);
}

try {
  git('init', '-q');
  git('config', 'user.email', 'harness@example.invalid');
  git('config', 'user.name', 'Harness Smoke');
  for (const name of ['Dirty.java', 'StableDirty.java', 'Staged.java', 'Delete.java', 'Rename.java']) {
    write(name, `class ${name.replace('.java', '')} {}\n`);
  }
  git('add', '.');
  git('commit', '-qm', 'baseline');

  write('Dirty.java', 'class Dirty { int before; }\n');
  write('StableDirty.java', 'class StableDirty { int unchanged; }\n');
  write('Staged.java', 'class Staged { int before; }\n');
  git('add', 'src/main/java/demo/Staged.java');
  write('ExistingUntracked.java', 'class ExistingUntracked { int before; }\n');
  const before = captureGovernedSnapshot(root);

  write('Dirty.java', 'class Dirty { int after; }\n');
  write('Staged.java', 'class Staged { int after; }\n');
  git('add', 'src/main/java/demo/Staged.java');
  write('ExistingUntracked.java', 'class ExistingUntracked { int after; }\n');
  fs.rmSync(path.join(javaRoot, 'Delete.java'));
  fs.renameSync(path.join(javaRoot, 'Rename.java'), path.join(javaRoot, 'Renamed.java'));
  write('Generated.java', 'class Generated {}\n');

  assert.deepEqual(diffGovernedSnapshots(before, captureGovernedSnapshot(root)), [
    'src/main/java/demo/Delete.java',
    'src/main/java/demo/Dirty.java',
    'src/main/java/demo/ExistingUntracked.java',
    'src/main/java/demo/Generated.java',
    'src/main/java/demo/Rename.java',
    'src/main/java/demo/Renamed.java',
    'src/main/java/demo/Staged.java',
  ]);
  console.log(`PASS hook-snapshot-attribution ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
