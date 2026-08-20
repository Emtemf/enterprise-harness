import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gitCommonDir, normalizeAgentType, sha256 } from './agent-evidence.mjs';
import {
  assertSafeId,
  assertSafeRunId,
  canonicalPath,
  isSafeId,
  isSafeRelativePath,
  isSafeRunId,
  pathIsWithin,
  resolveChild,
  resolveWithin,
} from './safe-paths.mjs';

export const HANDOFF_VERSION = 1;
export const HANDOFF_RESULT_START = 'ENTERPRISE_HARNESS_HANDOFF_RESULT';
export const HANDOFF_RESULT_END = 'END_ENTERPRISE_HARNESS_HANDOFF_RESULT';
const STAGES = new Set(['clarify', 'classify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive']);
const ROLES = new Set(['execute', 'check']);

export function behaviorRegistryPath(root) {
  // v5 behavior-checks.json moved to runtime/compat/v5/. For v6,
  // harness/policy.json owns capability and artifact policy while
  // runtime/lib/review-rubrics.mjs owns rubric selection. This reader is kept
  // for v4/v5 handoff compatibility only.
  const compatPath = path.join(root, 'runtime', 'compat', 'v5', 'behavior-checks.json');
  if (fs.existsSync(compatPath)) return compatPath;
  // Legacy path for repos that haven't migrated yet
  return path.join(root, 'harness', 'behavior-checks.json');
}

export function loadBehaviorRegistry(root) {
  const p = behaviorRegistryPath(root);
  if (!fs.existsSync(p)) {
    throw new Error(`EH-V5-COMPAT-001: behavior-checks.json not found at ${p}; v0.5 uses harness/policy.json instead. Use handoff v2 for v6 changes.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function runsDir(root, changeId) {
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  return path.join(changeDir, 'runs');
}

export function runDir(root, changeId, runId) {
  assertSafeRunId(runId);
  return resolveChild(runsDir(root, changeId), runId, 'runId');
}

export function handoffInputPath(root, changeId, runId) {
  return path.join(runDir(root, changeId, runId), 'input.json');
}

export function handoffSpoolDir(root, changeId, runId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId);
  const commonDir = gitCommonDir(root);
  return resolveChild(path.join(commonDir, 'enterprise-harness', 'runs', changeId), runId, 'runId');
}

export function handoffResultPath(root, changeId, runId, role = 'execute') {
  return path.join(runDir(root, changeId, runId), role === 'check' ? 'check.json' : 'result.json');
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    try {
      fs.renameSync(temporary, target);
    } catch (renameError) {
      // Windows: renameSync throws EPERM when the target already exists; unlink first then retry.
      if (renameError.code === 'EPERM' || renameError.code === 'EEXIST') {
        fs.unlinkSync(target);
        fs.renameSync(temporary, target);
      } else {
        throw renameError;
      }
    }
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* ignore */ }
  }
}

export function createHandoffInput(root, {
  changeId,
  stage,
  behavior,
  role = 'execute',
  agentType,
  skill,
  attempt = 1,
  inputRefs = [],
  parentRunId = null,
  target = '',
  context = [],
  pathSummary = '',
  correction = '',
}) {
  assertSafeId(changeId, 'changeId');
  const registry = loadBehaviorRegistry(root);
  const contract = registry.behaviors?.[behavior];
  if (!contract) {
    const legal = Object.keys(registry.behaviors || {}).join(', ');
    throw new Error(`unknown governed behavior: ${behavior}; legal behaviors: ${legal}`);
  }
  if (contract.stage !== stage) throw new Error(`behavior ${behavior} belongs to stage ${contract.stage}`);
  if (!ROLES.has(role)) throw new Error(`unsupported handoff role: ${role}`);
  const expectedAgent = role === 'check' ? contract.checker : contract.executor;
  const expectedSkill = role === 'check' ? contract.checkerSkill : contract.executorSkill;
  const normalizedAgent = normalizeAgentType(agentType || expectedAgent);
  if (normalizedAgent !== expectedAgent) {
    throw new Error(`agent ${normalizedAgent} does not match ${role} contract ${expectedAgent}`);
  }
  if ((skill || expectedSkill) !== expectedSkill) {
    throw new Error(`skill ${skill} does not match ${role} contract ${expectedSkill}`);
  }
  if (role === 'check') {
    if (!parentRunId) throw new Error('checker handoff requires parentRunId');
    assertSafeRunId(parentRunId, 'parentRunId');
    const parentResult = handoffResultPath(root, changeId, parentRunId, 'execute');
    if (!fs.existsSync(parentResult)) throw new Error(`executor result does not exist: ${parentResult}`);
  }
  const runId = `run_${randomUUID()}`;
  const effectiveInputRefs = role === 'check' && parentRunId && inputRefs.length === 0
    ? [path.relative(root, handoffResultPath(root, changeId, parentRunId, 'execute'))]
    : inputRefs;
  // An executor treats target plus inputRefs as its only authoritative input, so
  // a handoff carrying neither hands it nothing to act on. Refuse instead of
  // letting the run stall with no artifact and no stated reason.
  if (String(target || '').trim() === '' && effectiveInputRefs.length === 0) {
    throw new Error(`handoff for ${behavior} requires a target or at least one inputRef`);
  }
  for (const ref of effectiveInputRefs) {
    if (!isSafeRelativePath(ref)) throw new Error(`inputRef must be a safe relative path: ${ref}`);
    resolveWithin(root, ref, 'inputRef');
  }
  const envelope = {
    handoffVersion: HANDOFF_VERSION,
    runId,
    changeId,
    stage,
    behavior,
    role,
    attempt: Number(attempt) || 1,
    parentRunId,
    agent: {
      type: normalizedAgent,
      skill: skill || expectedSkill,
    },
    tecpc: {
      target,
      evidence: [],
      context,
      path: pathSummary,
      correction,
    },
    inputRefs: effectiveInputRefs,
    inputDigests: Object.fromEntries(effectiveInputRefs
      .filter((ref) => fs.existsSync(resolveWithin(root, ref, 'inputRef')))
      .map((ref) => [ref, sha256(fs.readFileSync(resolveWithin(root, ref, 'inputRef')))])),
    createdAt: new Date().toISOString(),
  };
  const targetPath = handoffInputPath(root, changeId, runId);
  atomicWriteJson(targetPath, envelope);
  const spoolPath = path.join(handoffSpoolDir(root, changeId, runId), 'task-brief.md');
  if (effectiveInputRefs.length > 0) {
    fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
    const briefRefs = effectiveInputRefs.filter((ref) => /(?:^|\/)briefs\/task-/u.test(ref));
    if (briefRefs.length > 0) {
      fs.writeFileSync(spoolPath, briefRefs.map((ref) => `# Task input\n\nSource: ${ref}\n\n${fs.readFileSync(resolveWithin(root, ref, 'inputRef'), 'utf-8')}`).join('\n\n'), 'utf-8');
    }
  }
  return { envelope, path: targetPath, spoolPath };
}

export function parseHandoffInputMarker(prompt) {
  const match = String(prompt || '').match(/(?:^|\n)HANDOFF_INPUT\s*=\s*([^\s]+)\s*(?:\n|$)/);
  return match?.[1] || null;
}

export function parseHandoffResult(message) {
  const escapedStart = HANDOFF_RESULT_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = HANDOFF_RESULT_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(message || '').match(new RegExp(`${escapedStart}\\s*\\n([\\s\\S]*?)\\n${escapedEnd}`));
  if (!match) return { ok: false, problems: ['missing HANDOFF_RESULT block'] };
  try {
    return { ok: true, value: JSON.parse(match[1]) };
  } catch (error) {
    return { ok: false, problems: [`invalid HANDOFF_RESULT JSON: ${error.message}`] };
  }
}

export function validateHandoffInput(envelope, expected = {}) {
  const problems = [];
  if (envelope?.handoffVersion !== HANDOFF_VERSION) problems.push(`handoffVersion must be ${HANDOFF_VERSION}`);
  if (!isSafeId(envelope?.changeId)) problems.push('changeId is missing or unsafe');
  if (!isSafeRunId(envelope?.runId)) problems.push('runId is missing or unsafe');
  if (!STAGES.has(envelope?.stage)) problems.push('stage is invalid');
  if (!envelope?.behavior) problems.push('behavior is missing');
  if (!ROLES.has(envelope?.role)) problems.push('role must be execute or check');
  if (!envelope?.agent?.type) problems.push('agent.type is missing');
  if (!envelope?.agent?.skill) problems.push('agent.skill is missing');
  if (!envelope?.tecpc || typeof envelope.tecpc !== 'object') problems.push('tecpc is missing');
  if (expected.changeId && envelope?.changeId !== expected.changeId) problems.push('changeId does not match active change');
  if (expected.agentType && normalizeAgentType(envelope?.agent?.type) !== normalizeAgentType(expected.agentType)) {
    problems.push('agent.type does not match dispatch');
  }
  return problems;
}

export function validateHandoffResult(result, input, expectedAgentType = null) {
  const problems = [];
  if (result?.handoffVersion !== HANDOFF_VERSION) problems.push(`handoffVersion must be ${HANDOFF_VERSION}`);
  for (const key of ['runId', 'changeId', 'stage', 'behavior', 'role']) {
    if (result?.[key] !== input?.[key]) problems.push(`${key} does not match input`);
  }
  if (expectedAgentType && normalizeAgentType(result?.agent?.type) !== normalizeAgentType(expectedAgentType)) {
    problems.push('result agent.type does not match observed subagent');
  }
  if (result?.agent?.skill !== input?.agent?.skill) problems.push('result agent.skill does not match preloaded skill');
  const tecpc = result?.tecpc;
  // 只做 presence 检查等于没检查：evidence: [] 既不是 undefined 也不是 null，
  // 空字符串同理。TECPC 的意义是"消费了什么真实证据"，空值必须判不合格。
  for (const key of ['target', 'evidence', 'context', 'path', 'correction']) {
    const value = tecpc?.[key];
    if (value === undefined || value === null) {
      problems.push(`tecpc.${key} is missing`);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) problems.push(`tecpc.${key} must not be empty`);
      else if (value.some((item) => !String(item ?? '').trim())) {
        problems.push(`tecpc.${key} must not contain empty entries`);
      }
      continue;
    }
    if (!String(value).trim()) problems.push(`tecpc.${key} must not be empty`);
  }
  if (!Array.isArray(result?.outputRefs)) problems.push('outputRefs must be an array');
  else if (result.outputRefs.some((ref) => !isSafeRelativePath(ref))) {
    problems.push('outputRefs must contain safe relative paths');
  }
  if (!Array.isArray(result?.blockers)) problems.push('blockers must be an array');
  if (!String(result?.summary || '').trim()) problems.push('summary is missing');
  if (input?.role === 'check' && !['pass', 'block', 'advisory'].includes(result?.verdict)) {
    problems.push('checker verdict must be pass, block, or advisory');
  }
  return problems;
}

export function loadHandoffInput(root, markerPath, expected = {}) {
  let absolute;
  try {
    absolute = resolveWithin(root, markerPath || '', 'HANDOFF_INPUT');
  } catch (error) {
    return { ok: false, path: null, problems: [error.message] };
  }
  if (!fs.existsSync(absolute)) return { ok: false, path: absolute, problems: ['input file does not exist'] };
  let envelope;
  try {
    envelope = JSON.parse(fs.readFileSync(absolute, 'utf-8'));
  } catch (error) {
    return { ok: false, path: absolute, problems: [`invalid input JSON: ${error.message}`] };
  }
  const problems = validateHandoffInput(envelope, expected);
  let canonical = null;
  if (isSafeId(envelope?.changeId) && isSafeRunId(envelope?.runId)) {
    canonical = handoffInputPath(root, envelope.changeId, envelope.runId);
  }
  if (!canonical || !pathIsWithin(absolute, root) || canonicalPath(canonical) !== canonicalPath(absolute)) {
    problems.push('input path is outside canonical run directory');
  }
  try {
    const contract = loadBehaviorRegistry(root).behaviors?.[envelope.behavior];
    if (!contract) {
      problems.push(`behavior is not registered: ${envelope.behavior}`);
    } else {
      if (contract.stage !== envelope.stage) problems.push('stage does not match behavior registry');
      const expectedAgent = envelope.role === 'check' ? contract.checker : contract.executor;
      const expectedSkill = envelope.role === 'check' ? contract.checkerSkill : contract.executorSkill;
      if (normalizeAgentType(envelope.agent?.type) !== expectedAgent) {
        problems.push('agent.type does not match behavior registry');
      }
      if (envelope.agent?.skill !== expectedSkill) {
        problems.push('agent.skill does not match behavior registry');
      }
    }
  } catch (error) {
    problems.push(`behavior registry unavailable: ${error.message}`);
  }
  for (const ref of envelope.inputRefs || []) {
    let refPath;
    try {
      refPath = resolveWithin(root, ref, 'inputRef');
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    if (!fs.existsSync(refPath)) {
      problems.push(`inputRef does not exist: ${ref}`);
      continue;
    }
    const recorded = envelope.inputDigests?.[ref];
    if (!recorded) {
      problems.push(`inputDigest is missing: ${ref}`);
    } else if (sha256(fs.readFileSync(refPath)) !== recorded) {
      problems.push(`inputRef is stale: ${ref}`);
    }
  }
  if (envelope.role === 'check') {
    if (!envelope.parentRunId) {
      problems.push('checker handoff requires parentRunId');
    } else {
      const parentRef = path.relative(
        root,
        handoffResultPath(root, envelope.changeId, envelope.parentRunId, 'execute'),
      );
      if (!(envelope.inputRefs || []).includes(parentRef)) {
        problems.push('checker inputRefs must include parent executor result');
      }
    }
  }
  return { ok: problems.length === 0, path: absolute, envelope, problems };
}

export function persistHandoffResult(root, input, result) {
  const target = handoffResultPath(root, input.changeId, input.runId, input.role);
  atomicWriteJson(target, {
    ...result,
    recordedAt: new Date().toISOString(),
    resultDigest: sha256(JSON.stringify(result)),
  });
  return target;
}
