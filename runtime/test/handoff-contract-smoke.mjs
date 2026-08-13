import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createHandoffInput,
  loadHandoffInput,
  parseHandoffResult,
  persistHandoffResult,
  validateHandoffResult,
  HANDOFF_RESULT_END,
  HANDOFF_RESULT_START,
} from '../lib/handoff.mjs';

const sourceRoot = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-contract-'));
const changeId = 'handoff-probe';
fs.mkdirSync(path.join(root, 'harness/changes', changeId), { recursive: true });
fs.copyFileSync(
  path.join(sourceRoot, 'runtime/compat/v5/behavior-checks.json'),
  path.join(root, 'harness/behavior-checks.json'),
);

try {
  // An executor's only authoritative input is its target plus inputRefs, so a
  // handoff carrying neither hands it nothing to work from. That was accepted
  // silently: a clarify.synthesize run was created with both empty and stalled
  // without producing requirements.md or reporting why.
  let refused = false;
  try {
    createHandoffInput(root, {
      changeId,
      stage: 'clarify',
      behavior: 'clarify.synthesize',
      role: 'execute',
      inputRefs: [],
      target: '',
    });
  } catch (error) {
    refused = true;
    assert.match(error.message, /target|inputRef/u);
  }
  assert.equal(refused, true, 'execute handoff with neither target nor inputRefs should be refused');

  // A target alone is enough — the first exploration of a change has no prior
  // artifact to reference.
  const targetOnly = createHandoffInput(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    role: 'execute',
    inputRefs: [],
    target: 'explore GreetingService and its callers',
  });
  assert.equal(targetOnly.envelope.role, 'execute');

  const execute = createHandoffInput(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    role: 'execute',
    inputRefs: [],
    target: 'produce the design for the greeting endpoint',
  });
  const loaded = loadHandoffInput(root, path.relative(root, execute.path), {
    changeId,
    agentType: 'enterprise-harness:design-executor',
  });
  assert.equal(loaded.ok, true, loaded.problems?.join('; '));
  assert.equal(loaded.envelope.agent.skill, 'harness');

  const result = {
    ...execute.envelope,
    tecpc: {
      target: 'produce design',
      evidence: ['design.md'],
      context: ['requirements.md'],
      path: 'executor then checker',
      correction: 'return to design on block',
    },
    outputRefs: ['harness/changes/handoff-probe/design.md'],
    blockers: [],
    summary: 'design produced',
  };
  const parsed = parseHandoffResult(
    `${HANDOFF_RESULT_START}\n${JSON.stringify(result)}\n${HANDOFF_RESULT_END}`,
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(validateHandoffResult(parsed.value, execute.envelope), []);
  persistHandoffResult(root, execute.envelope, result);

  const check = createHandoffInput(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    role: 'check',
    parentRunId: execute.envelope.runId,
  });
  assert.equal(check.envelope.agent.type, 'enterprise-harness:design-reviewer');
  assert.equal(check.envelope.agent.skill, 'harness');
  assert.equal(check.envelope.parentRunId, execute.envelope.runId);
  assert.ok(check.envelope.inputRefs.some((ref) => ref.includes(execute.envelope.runId)));
  assert.equal(loadHandoffInput(root, path.relative(root, check.path)).ok, true);

  const invalid = { ...result, runId: 'run_wrong' };
  assert.ok(validateHandoffResult(invalid, execute.envelope).includes('runId does not match input'));

  const tampered = JSON.parse(fs.readFileSync(execute.path, 'utf-8'));
  tampered.agent.skill = 'invalid-skill';
  fs.writeFileSync(execute.path, `${JSON.stringify(tampered, null, 2)}\n`);
  assert.ok(loadHandoffInput(root, path.relative(root, execute.path)).problems
    .includes('agent.skill does not match behavior registry'));
  // unknown behavior must list legal behaviors in the error message
  try {
    createHandoffInput(root, { changeId: 'probe', stage: 'clarify', behavior: 'exploration', role: 'execute' });
    assert.fail('should have thrown for unknown behavior');
  } catch (error) {
    assert.match(error.message, /legal behaviors/);
    assert.match(error.message, /clarify.explore-code/);
  }

console.log(`PASS handoff-contract ${process.argv[2] || 'verify'}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
