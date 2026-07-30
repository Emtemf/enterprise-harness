import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const generated = spawnSync(process.execPath, [path.join(root, 'bin', 'generate-hooks.mjs'), '--check'], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
});
assert.equal(generated.status, 0, generated.stderr);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'plugin', 'hooks-manifest.json'), 'utf-8'));
for (const entries of Object.values(manifest.hooks)) {
  for (const entry of entries) {
    assert.ok(Number.isInteger(entry.performanceBudgetMs) && entry.performanceBudgetMs > 0);
    assert.ok(['fail-open', 'fail-closed'].includes(entry.failMode));
    assert.ok(fs.existsSync(path.join(root, 'harness', 'plugin', 'runtime', 'hooks', entry.script)));
  }
}
console.log(`PASS hook-manifest-parity ${mode}`);
