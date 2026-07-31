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
  path.join(sourceRoot, 'harness/behavior-checks.json'),
  path.join(root, 'harness/behavior-checks.json'),
);

try {
  const execute = createHandoffInput(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    role: 'execute',
    inputRefs: [],
  });
  const loaded = loadHandoffInput(root, path.relative(root, execute.path), {
    changeId,
    agentType: 'enterprise-harness:design-executor',
  });
  assert.equal(loaded.ok, true, loaded.problems?.join('; '));
  assert.equal(loaded.envelope.agent.skill, 'harness-stage-executor');

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
  assert.equal(check.envelope.agent.skill, 'harness-stage-checker');
  assert.equal(check.envelope.parentRunId, execute.envelope.runId);
  assert.ok(check.envelope.inputRefs.some((ref) => ref.includes(execute.envelope.runId)));
  assert.equal(loadHandoffInput(root, path.relative(root, check.path)).ok, true);

  const invalid = { ...result, runId: 'run_wrong' };
  assert.ok(validateHandoffResult(invalid, execute.envelope).includes('runId does not match input'));

  const tampered = JSON.parse(fs.readFileSync(execute.path, 'utf-8'));
  tampered.agent.skill = 'harness-stage-checker';
  fs.writeFileSync(execute.path, `${JSON.stringify(tampered, null, 2)}\n`);
  assert.ok(loadHandoffInput(root, path.relative(root, execute.path)).problems
    .includes('agent.skill does not match behavior registry'));
  console.log(`PASS handoff-contract ${process.argv[2] || 'verify'}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
