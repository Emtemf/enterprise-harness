import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertSafeId, assertSafeRunId, resolveChild, resolveWithin } from '../lib/safe-paths.mjs';
import { gitCommonDir } from '../lib/agent-evidence.mjs';
import { atomicWriteJson } from '../lib/state-store.mjs';

const ROLES = new Set(['execute', 'check']);

export function v2RunDir(root, changeId, runId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  return resolveChild(path.join(gitCommonDir(root), 'enterprise-harness', 'runs', changeId), runId, 'runId');
}

export function v2InputPath(root, changeId, runId) {
  return path.join(v2RunDir(root, changeId, runId), 'input.json');
}

export function v2ResultPath(root, changeId, runId, role = 'execute') {
  if (!ROLES.has(role)) throw new Error(`EH-HANDOFF-V2-023: invalid role ${role}`);
  return path.join(v2RunDir(root, changeId, runId), role === 'check' ? 'check.json' : 'result.json');
}

function sha256File(root, ref) {
  const target = resolveWithin(root, ref, 'inputRef');
  return createHash('sha256').update(fs.readFileSync(target)).digest('hex');
}

export function createHandoffV2(root, { changeId, stage, behavior, role = 'execute', agent, inputRefs = [], parentRunId = null, tecpc }) {
  assertSafeId(changeId, 'changeId');
  if (!ROLES.has(role)) throw new Error(`EH-HANDOFF-V2-023: invalid role ${role}`);
  if (!agent?.type || !agent?.skill) throw new Error('EH-HANDOFF-V2-024: agent type and skill are required');
  if (!tecpc || !String(tecpc.target || '').trim()) throw new Error('EH-HANDOFF-V2-025: TECPC target is required');
  if (role === 'check' && !parentRunId) throw new Error('EH-HANDOFF-V2-026: checker requires parentRunId');
  const runId = `run_${randomUUID()}`;
  const input = {
    handoffVersion: 2,
    runId,
    changeId,
    stage,
    behavior,
    role,
    parentRunId,
    agent: { type: agent.type, skill: agent.skill },
    tecpc: {
      target: tecpc.target,
      evidence: Array.isArray(tecpc.evidence) ? [...tecpc.evidence] : [],
      context: Array.isArray(tecpc.context) ? [...tecpc.context] : [],
      path: tecpc.path || '',
      correction: tecpc.correction ?? null,
    },
    inputRefs: [...inputRefs],
    inputDigests: Object.fromEntries(inputRefs.map((ref) => [ref, sha256File(root, ref)])),
    createdAt: new Date().toISOString(),
  };
  const inputPath = v2InputPath(root, changeId, runId);
  atomicWriteJson(inputPath, input);
  return { runId, path: inputPath, input };
}

export function loadHandoffV2(root, changeId, runId) {
  const inputPath = v2InputPath(root, changeId, runId);
  if (!fs.existsSync(inputPath)) throw new Error(`EH-HANDOFF-V2-027: input does not exist for ${changeId}/${runId}`);
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  if (input.handoffVersion !== 2) throw new Error(`EH-HANDOFF-V2-028: expected v2 input, got v${input.handoffVersion}`);
  return input;
}
