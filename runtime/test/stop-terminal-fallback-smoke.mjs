import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const stopScript = path.join(repoRoot, 'hooks', 'scripts', 'stop.mjs');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stop-terminal-'));
const transcript = path.join(fixtureRoot, 'transcript.jsonl');
const validFallback = [
  'Fact lanes: code=pending, docs=pending',
  'Next research action/blocker: Plan mode blocks research dispatch',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
].join('\n');

function invoke(payload, input = JSON.stringify(payload)) {
  return spawnSync('node', [stopScript], {
    cwd: fixtureRoot,
    encoding: 'utf-8',
    input,
    shell: false,
  });
}

function harnessEvent(overrides = {}) {
  return {
    hook_event_name: 'Stop',
    cwd: fixtureRoot,
    permission_mode: 'plan',
    transcript_path: transcript,
    stop_hook_active: false,
    last_assistant_message: 'What change should I inspect?',
    ...overrides,
  };
}

try {
  fs.writeFileSync(transcript, `${JSON.stringify({
    type: 'user',
    message: { content: '<command-name>/enterprise-harness:harness</command-name>\\nContinue the change.' },
  })}\n`);

  const invalid = invoke(harnessEvent());
  const invalidEnvelope = JSON.parse(invalid.stdout);
  assert.equal(invalid.status, 0, `invalid fallback must use the Stop JSON contract: ${invalid.stderr}`);
  assert.equal(invalidEnvelope.decision, 'block');
  assert.match(invalidEnvelope.reason, /exactly these five lines/u);
  assert.match(invalidEnvelope.reason, /User question: none/u);
  assert.equal(invalid.stderr, '', 'mechanical correction must not emit diagnostic noise');

  const valid = invoke(harnessEvent({ last_assistant_message: validFallback }));
  assert.equal(valid.status, 0);
  assert.deepEqual(JSON.parse(valid.stdout), {});
  assert.equal(valid.stderr, '');

  const retry = invoke(harnessEvent({ stop_hook_active: true }));
  assert.equal(retry.status, 0, 'the correction must never form a Stop-hook loop');
  assert.deepEqual(JSON.parse(retry.stdout), {});

  fs.writeFileSync(transcript, `${JSON.stringify({
    type: 'user',
    message: { content: 'Help me outline a normal plan.' },
  })}\n`);
  const unrelatedPlan = invoke(harnessEvent());
  assert.equal(unrelatedPlan.status, 0);
  assert.deepEqual(JSON.parse(unrelatedPlan.stdout), {}, 'ordinary Plan turns are outside Harness fallback enforcement');

  fs.writeFileSync(transcript, `${JSON.stringify({
    type: 'user',
    message: { content: '<command-name>/enterprise-harness:harness</command-name>' },
  })}\n`);
  const executableMode = invoke(harnessEvent({ permission_mode: 'default' }));
  assert.equal(executableMode.status, 0);
  assert.deepEqual(JSON.parse(executableMode.stdout), {}, 'non-Plan turns may execute the selected research action');

  const changeId = 'terminal-research-route';
  const changeDir = path.join(fixtureRoot, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    currentTask: null,
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(fixtureRoot, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  const activeResearch = invoke(harnessEvent());
  assert.equal(JSON.parse(activeResearch.stdout).decision, 'block', 'active Clarify research route has the same fallback obligation');

  fs.writeFileSync(path.join(changeDir, 'requirements.md'), [
    '# Requirements',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No code research needed. |',
    '| docs | no | none | none | none | not-required | No docs research needed. |',
    '- remaining fact uncertainty: none',
    '## 组件拓扑',
    '',
  ].join('\n'));
  const activeDecisionRoute = invoke(harnessEvent());
  assert.deepEqual(
    JSON.parse(activeDecisionRoute.stdout),
    {},
    'the Stop hook must not broaden mechanical fallback enforcement to a decisions route',
  );

  const malformed = invoke(null, '{');
  assert.equal(malformed.status, 2);
  assert.equal(malformed.stdout, '');
  assert.match(malformed.stderr, /EH-HOOK-INPUT-017/u);

  if (mode === 'red') {
    console.error('Red precondition no longer holds.');
    process.exit(1);
  }
  console.log(`PASS stop-terminal-fallback ${mode}`);
} catch (error) {
  if (mode === 'red') {
    console.log(`PASS RED stop-terminal-fallback: ${error.message}`);
  } else {
    throw error;
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
