import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createHandoffV2,
  loadHandoffV2,
  loadHandoffV2FromMarker,
  parseHandoffV2Marker,
  v2InputPath,
} from '../core/handoff-v2.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-handoff-v2-'));
try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', 'handoff-v2'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'changes', 'handoff-v2', 'requirements.md'), '# Requirements\n', 'utf-8');

  const created = createHandoffV2(root, {
    changeId: 'handoff-v2',
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: ['harness/changes/handoff-v2/requirements.md'],
    tecpc: { target: 'map the target project', path: 'runtime/' },
  });
  const expectedSegment = ['enterprise-harness', 'runs', 'handoff-v2'].join(path.sep);
  assert.ok(
    created.path.includes(`${path.sep}${expectedSegment}${path.sep}`)
      && created.path.includes('.git'),
    `v2 input must live under .git/enterprise-harness/runs; got ${created.path}`,
  );
  assert.equal(fs.existsSync(path.join(root, 'harness', 'changes', 'handoff-v2', 'runs')), false, 'v2 must not create subject-local runs');
  assert.equal(v2InputPath(root, 'handoff-v2', created.runId), created.path);
  const loaded = loadHandoffV2(root, 'handoff-v2', created.runId);
  assert.equal(loaded.handoffVersion, 2);
  assert.equal(loaded.inputRefs[0], 'harness/changes/handoff-v2/requirements.md');
  assert.ok(loaded.inputDigests[loaded.inputRefs[0]]);

  const marker = path.relative(root, created.path);
  const exactPrompt = `HANDOFF_INPUT=${marker}`;
  assert.equal(parseHandoffV2Marker(exactPrompt), marker);
  for (const pollutedPrompt of [
    `Dispatch this worker:\n${exactPrompt}`,
    `${exactPrompt}\nProduce the artifact.`,
    `${exactPrompt}\n${exactPrompt}`,
    ` ${exactPrompt}`,
    `${exactPrompt}\n`,
    `HANDOFF_INPUT = ${marker}`,
  ]) {
    assert.equal(
      parseHandoffV2Marker(pollutedPrompt),
      null,
      `v2 marker parser must reject non-exact input: ${JSON.stringify(pollutedPrompt)}`,
    );
  }

  const forgedDir = path.join(path.dirname(path.dirname(created.path)), 'run_forged');
  fs.mkdirSync(forgedDir, { recursive: true });
  const forgedPath = path.join(forgedDir, 'input.json');
  fs.copyFileSync(created.path, forgedPath);
  const forged = loadHandoffV2FromMarker(root, path.relative(root, forgedPath));
  assert.equal(forged.ok, false, 'marker path must be the envelope identity canonical input path');
  assert.match(forged.problems.join('; '), /canonical v2 input path/u);

  console.log('PASS handoff-v2-common-dir verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
