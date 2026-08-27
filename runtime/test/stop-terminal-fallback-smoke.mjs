import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendLaneApplicabilityFixture } from './classification-v2-fixture.mjs';

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

function invoke(payload, input = JSON.stringify(payload), args = []) {
  return spawnSync('node', [stopScript, ...args], {
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
    message: { content: 'Transcript content is not an invocation authority.' },
  })}\n`);

  const globalStop = invoke(harnessEvent());
  assert.deepEqual(JSON.parse(globalStop.stdout), {}, 'the plugin-global Stop hook remains guidance-only');

  const invalid = invoke(
    harnessEvent({ session_id: 'terminal-fallback-session' }),
    undefined,
    ['--terminal-fallback-scope'],
  );
  const invalidEnvelope = JSON.parse(invalid.stdout);
  assert.equal(invalid.status, 0, `invalid fallback must use the Stop JSON contract: ${invalid.stderr}`);
  assert.equal(invalidEnvelope.decision, 'block');
  assert.match(invalidEnvelope.reason, /exactly these five lines/u);
  assert.match(invalidEnvelope.reason, /User question: none/u);
  assert.equal(invalid.stderr, '', 'mechanical correction must not emit diagnostic noise');

  const valid = invoke(harnessEvent({ last_assistant_message: validFallback }), undefined, ['--terminal-fallback-scope']);
  assert.equal(valid.status, 0);
  assert.deepEqual(JSON.parse(valid.stdout), {});
  assert.equal(valid.stderr, '');

  const retry = invoke(harnessEvent({ stop_hook_active: true }), undefined, ['--terminal-fallback-scope']);
  assert.equal(retry.status, 0, 'the correction must never form a Stop-hook loop');
  assert.deepEqual(JSON.parse(retry.stdout), {});

  const executableMode = invoke(harnessEvent({ permission_mode: 'default' }), undefined, ['--terminal-fallback-scope']);
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
  const activeResearch = invoke(harnessEvent(), undefined, ['--terminal-fallback-scope']);
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
  appendLaneApplicabilityFixture(
    fixtureRoot,
    changeId,
    `harness/changes/${changeId}/requirements.md`,
  );
  const activeDecisionRoute = invoke(harnessEvent(), undefined, ['--terminal-fallback-scope']);
  assert.deepEqual(
    JSON.parse(activeDecisionRoute.stdout),
    {},
    'the Stop hook must not broaden mechanical fallback enforcement to a decisions route',
  );
  const dualEvent = harnessEvent({
    session_id: 'dual-registration-session',
    last_assistant_message: validFallback,
  });
  const dualGlobal = invoke(dualEvent);
  assert.deepEqual(JSON.parse(dualGlobal.stdout), {});
  assert.match(dualGlobal.stderr, /Stop handoff guidance/u);
  const dualSkill = invoke(dualEvent, undefined, ['--terminal-fallback-scope']);
  assert.deepEqual(JSON.parse(dualSkill.stdout), {});
  assert.equal(dualSkill.stderr, '', 'Skill-scoped Stop must not duplicate plugin-global guidance');

  const malformed = invoke(null, '{');
  assert.equal(malformed.status, 2);
  assert.equal(malformed.stdout, '');
  assert.match(malformed.stderr, /EH-HOOK-INPUT-017/u);

  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'harness', 'SKILL.md'), 'utf-8');
  assert.match(skill, /^hooks:\n\s+Stop:/mu, 'Harness must register its terminal validator through skill frontmatter');
  assert.match(skill, /stop\.mjs" --terminal-fallback-scope/u);

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
