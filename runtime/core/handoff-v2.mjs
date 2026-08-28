import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertSafeId, assertSafeRunId, pathIsWithin, resolveChild, resolveWithin } from '../lib/safe-paths.mjs';
import { gitCommonDir, normalizeAgentType } from '../lib/agent-evidence.mjs';
import { atomicWriteJson, withChangeTransaction } from '../lib/state-store.mjs';
import { selectReviewRubrics } from '../lib/review-rubrics.mjs';
import {
  validateHandoffV2Contract,
  validateResearchPacket,
  validateReviewResult,
  validateStageResult,
} from '../lib/result-contract.mjs';

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

function sameDigestMap(left, right) {
  const leftEntries = Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function researchSourceForAgent(agentType) {
  const normalized = normalizeAgentType(agentType);
  if (normalized === 'enterprise-harness:code-explore') return 'code-explore';
  if (normalized === 'enterprise-harness:doc-research') return 'doc-research';
  return null;
}

export function createHandoffV2(root, {
  changeId,
  stage,
  behavior,
  role = 'execute',
  agent,
  inputRefs = [],
  parentRunId = null,
  tecpc,
  rubricIds = role === 'check' ? selectReviewRubrics({ stage }) : [],
}) {
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
    rubricIds: [...rubricIds],
    createdAt: new Date().toISOString(),
  };
  const inputPath = v2InputPath(root, changeId, runId);
  const problems = validateHandoffV2Contract(input);
  if (problems.length > 0) throw new Error(`EH-HANDOFF-V2-029: ${problems.join('; ')}`);
  atomicWriteJson(inputPath, input);
  return { runId, path: inputPath, input };
}

export function loadHandoffV2(root, changeId, runId) {
  const inputPath = v2InputPath(root, changeId, runId);
  if (!fs.existsSync(inputPath)) throw new Error(`EH-HANDOFF-V2-027: input does not exist for ${changeId}/${runId}`);
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  if (input.handoffVersion !== 2) throw new Error(`EH-HANDOFF-V2-028: expected v2 input, got v${input.handoffVersion}`);
  const problems = validateHandoffV2Contract(input);
  if (problems.length > 0) throw new Error(`EH-HANDOFF-V2-029: ${problems.join('; ')}`);
  return input;
}

export function persistHandoffV2Result(root, changeId, runId, result) {
  return withChangeTransaction(root, changeId, () => persistHandoffV2ResultUnlocked(root, changeId, runId, result));
}

function persistHandoffV2ResultUnlocked(root, changeId, runId, result) {
  const input = loadHandoffV2(root, changeId, runId);
  const problems = [];
  const target = v2ResultPath(root, changeId, runId, input.role);

  if (input.role === 'execute') {
    const researchSource = researchSourceForAgent(input.agent?.type);
    if (researchSource) {
      problems.push(...validateResearchPacket(root, result));
      if (result?.changeId !== input.changeId || result?.source !== researchSource) {
        problems.push('ResearchPacket does not bind the execute handoff agent');
      }
      if (!sameDigestMap(result?.inputDigests, input.inputDigests)
          || JSON.stringify(result?.inputRefs) !== JSON.stringify(input.inputRefs)) {
        problems.push('ResearchPacket inputs do not match the execute handoff');
      }
    } else {
      problems.push(...validateStageResult(root, result));
      if (result?.runId !== input.runId || result?.changeId !== input.changeId || result?.stage !== input.stage) {
        problems.push('StageResult does not bind the execute handoff');
      }
      if (!sameDigestMap(result?.inputDigests, input.inputDigests)) {
        problems.push('StageResult input digests do not match the execute handoff');
      }
      if (normalizeAgentType(result?.producer?.agentType) !== normalizeAgentType(input.agent?.type)
          || result?.producer?.skill !== input.agent?.skill) {
        problems.push('StageResult producer does not match handoff agent');
      }
    }
  } else {
    let parent;
    try {
      parent = loadHandoffV2(root, changeId, input.parentRunId);
    } catch (error) {
      problems.push(`parent handoff is invalid: ${error.message}`);
    }
    const parentPath = parent ? v2ResultPath(root, changeId, input.parentRunId, 'execute') : null;
    let stageResult = null;
    if (!parentPath || !fs.existsSync(parentPath)) {
      problems.push('parent StageResult is missing');
    } else {
      try {
        stageResult = JSON.parse(fs.readFileSync(parentPath, 'utf-8'));
        problems.push(...validateStageResult(root, stageResult));
        if (parent?.role !== 'execute') problems.push('parent handoff must have execute role');
        if (stageResult?.runId !== parent?.runId || stageResult?.changeId !== parent?.changeId || stageResult?.stage !== parent?.stage) {
          problems.push('parent StageResult does not bind the parent handoff');
        }
        if (!sameDigestMap(stageResult?.inputDigests, parent?.inputDigests)) {
          problems.push('parent StageResult input digests do not match the parent handoff');
        }
        if (normalizeAgentType(stageResult?.producer?.agentType) !== normalizeAgentType(parent?.agent?.type)
            || stageResult?.producer?.skill !== parent?.agent?.skill) {
          problems.push('parent StageResult producer does not match the parent handoff');
        }
      } catch (error) {
        problems.push(`parent StageResult is invalid JSON: ${error.message}`);
      }
    }
    problems.push(...validateReviewResult(root, result, { stageResult }));
    if (result?.runId !== input.runId || result?.changeId !== input.changeId || result?.stage !== input.stage
        || result?.parentRunId !== input.parentRunId || result?.reviewedRunId !== input.parentRunId) {
      problems.push('ReviewResult does not bind the check handoff');
    }
    if (normalizeAgentType(result?.reviewer?.agentType) !== normalizeAgentType(input.agent?.type)
        || result?.reviewer?.skill !== input.agent?.skill) {
      problems.push('ReviewResult reviewer does not match handoff agent');
    }
  }

  if (problems.length > 0) throw new Error(`EH-HANDOFF-V2-030: ${problems.join('; ')}`);
  if (fs.existsSync(target)) throw new Error(`EH-HANDOFF-V2-031: durable result already exists: ${target}`);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, target);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`EH-HANDOFF-V2-031: durable result already exists: ${target}`);
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { input, path: target };
}

export function parseHandoffV2Marker(prompt) {
  const match = String(prompt || '').match(/(?:^|\n)HANDOFF_INPUT\s*=\s*([^\s]+)\s*(?:\n|$)/);
  return match?.[1] || null;
}

export function loadHandoffV2FromMarker(root, markerPath, expected = {}) {
  const problems = [];
  const absolute = path.resolve(root, markerPath || '');
  const commonRuns = path.join(gitCommonDir(root), 'enterprise-harness', 'runs');
  if (!pathIsWithin(absolute, commonRuns)) {
    return { ok: false, path: absolute, problems: ['input path is outside v2 common-dir runs'] };
  }
  if (!fs.existsSync(absolute)) return { ok: false, path: absolute, problems: ['input file does not exist'] };
  let input;
  try {
    input = JSON.parse(fs.readFileSync(absolute, 'utf-8'));
  } catch (error) {
    return { ok: false, path: absolute, problems: [`invalid input JSON: ${error.message}`] };
  }
  problems.push(...validateHandoffV2Contract(input));
  try {
    const canonicalInputPath = path.resolve(v2InputPath(root, input.changeId, input.runId));
    if (absolute !== canonicalInputPath) problems.push('marker path is not the envelope canonical v2 input path');
  } catch (error) {
    problems.push(`canonical v2 input path is invalid: ${error.message}`);
  }
  if (expected.changeId && input.changeId !== expected.changeId) problems.push('changeId does not match active change');
  if (expected.agentType && normalizeAgentType(input.agent?.type) !== normalizeAgentType(expected.agentType)) {
    problems.push('agent.type does not match dispatch');
  }
  if (!input.agent?.type || !input.agent?.skill) problems.push('agent type and skill are required');
  if (!['execute', 'check'].includes(input.role)) problems.push('role must be execute or check');
  if (!input.tecpc?.target || !Array.isArray(input.inputRefs) || !input.inputDigests) {
    problems.push('v2 TECPC target and input references are required');
  }
  for (const ref of input.inputRefs || []) {
    try {
      if (input.inputDigests?.[ref] !== sha256File(root, ref)) problems.push(`input digest is stale: ${ref}`);
    } catch (error) {
      problems.push(`input ref is unreadable: ${ref} (${error.message})`);
    }
  }
  return { ok: problems.length === 0, path: absolute, envelope: input, problems };
}
