import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateCodegraphIndex } from '../lib/codegraph-index.mjs';

const mode = process.argv[2] || 'verify';
const root = fileURLToPath(new URL('../../', import.meta.url));

// `codegraph status` exits 0 whether or not an index exists, so an uninitialized
// project silently degrades: every graph query fails and the explorer falls back
// to raw grep/read, which is the context blowup the subagent contract exists to
// prevent. Exit code alone cannot detect this — the output must be read.
const uninitialized = evaluateCodegraphIndex({
  status: 0,
  stdout: 'CodeGraph Status\n\nProject: /tmp/x\nNot initialized\nRun "codegraph init" to initialize\n',
});
assert.equal(uninitialized.ok, false);
assert.equal(uninitialized.status, 'not-initialized');
assert.match(uninitialized.detail, /codegraph init/u);

const indexed = evaluateCodegraphIndex({
  status: 0,
  stdout: 'CodeGraph Status\n\nProject: /repo\n\nIndex Statistics:\n  Files:     222\n  Nodes:     3,658\n',
});
assert.equal(indexed.ok, true);
assert.equal(indexed.status, 'indexed');

const missing = evaluateCodegraphIndex({ status: 127, stdout: '', stderr: 'command not found' });
assert.equal(missing.ok, false);
assert.equal(missing.status, 'unavailable');

// An uninitialized index must not be reported as a healthy tool.
function doctorCodegraph(cwd) {
  const result = spawnSync(process.execPath, [path.join(root, 'runtime', 'doctor.mjs'), '--json'], {
    cwd,
    encoding: 'utf-8',
    shell: false,
  });
  return JSON.parse(result.stdout).checks.find((check) => check.name === 'codegraph');
}

const here = doctorCodegraph(root);
assert.ok(here.status, 'doctor must report a codegraph index status, not just a bare ok flag');

console.log(`PASS codegraph-index-guard ${mode}`);
