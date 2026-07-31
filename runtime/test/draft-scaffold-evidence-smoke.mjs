import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateChangeEvidence } from '../lib/checks.mjs';

const sourceRoot = process.cwd();
const changeId = 'draft-scaffold-probe';

function scaffolded() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-draft-scaffold-'));
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  const result = spawnSync('node', [
    path.join(sourceRoot, 'runtime/cli.mjs'),
    'start-change', changeId, 'smoke', 'L1', 'draft scaffold probe',
  ], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, `start-change must succeed; stderr=${result.stderr}`);
  return root;
}

function statePath(root) {
  return path.join(root, 'harness/changes', changeId, 'state.json');
}

// start-change produces a DRAFT scaffold whose clarify artifacts are intentionally
// empty templates. That scaffold must not fail the repo's own evidence validators —
// otherwise `verify` and `prepublish-check` block on the tool's own output.
{
  const root = scaffolded();
  const problems = validateChangeEvidence(root);
  assert.deepEqual(
    problems,
    [],
    `freshly scaffolded DRAFT change must pass evidence validation; got ${JSON.stringify(problems, null, 2)}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// Once the change leaves DRAFT, the clarify evidence requirements apply in full:
// the exemption must not become a permanent bypass.
{
  const root = scaffolded();
  const state = JSON.parse(fs.readFileSync(statePath(root), 'utf-8'));
  state.state = 'DISCOVERED';
  fs.writeFileSync(statePath(root), `${JSON.stringify(state, null, 2)}\n`);

  const problems = validateChangeEvidence(root);
  assert.ok(
    problems.some((problem) => /歧义评分/.test(problem)),
    `non-DRAFT change must still require ambiguity scores; got ${JSON.stringify(problems)}`,
  );
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`PASS draft-scaffold-evidence ${process.argv[2] || 'verify'}`);
