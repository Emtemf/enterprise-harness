import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GOVERNANCE_BLOCKLIST, hasCurrentTaskTddExecutionEvidence } from './gates.mjs';
import { validateAmbiguityGate } from './ambiguity.mjs';
import { validateRouterScore } from './router-score.mjs';
import { evidenceModeForChange } from './evidence-policy.mjs';
import { readAndValidateTddReceipt } from './tdd-receipts.mjs';

export function projectRoot() {
  return process.cwd();
}

export function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

// A project is "harness-managed" only when it actually contains the durable
// harness governance assets in its own working tree. When the plugin is
// installed into a target project that has NOT been onboarded, structure/state
// validation must NOT run against the target's cwd — otherwise hooks spam
// harness self-structure errors (see issue #21 cluster).
export function isHarnessManaged(root) {
  return fs.existsSync(path.join(root, 'harness', 'changes'))
    && fs.existsSync(path.join(root, 'harness', 'specs'));
}

// Looser than isHarnessManaged: a target project that has started using `start-change`
// (which only creates harness/changes/, not harness/specs/) should still get its change
// artifact/evidence validated, even before it has authored any stable harness/specs/.
export function hasChangeTracking(root) {
  return fs.existsSync(path.join(root, 'harness', 'changes'));
}

export function requiredPaths() {
  return {
    dirs: [
      '.claude',
      '.claude/rules',
      '.claude/agents',
      '.claude/skills',
      '.claude/skills/harness',
      '.claude/skills/harness-intake',
      '.claude/skills/harness-design',
      '.claude/skills/harness-plan',
      '.claude/skills/harness-tdd',
      '.claude/skills/harness-verify',
      'hooks',
      'harness',
      'harness/templates',
      'harness/changes',
      'harness/specs',
      'harness/reviewers',
      'harness/plugin/runtime',
    ],
    files: [
      'AGENTS.md',
      'CLAUDE.md',
      '.mcp.json',
      '.claude/settings.json',
      '.claude/rules/00-workflow.md',
      '.claude/rules/10-exploration.md',
      '.claude/rules/20-java.md',
      '.claude/rules/30-testing-and-review.md',
      '.claude/agents/requirement-reviewer.md',
      '.claude/agents/design-reviewer.md',
      '.claude/agents/plan-critic.md',
      '.claude/agents/api-consistency-reviewer.md',
      '.claude/agents/verification-reviewer.md',
      '.claude/agents/code-explore.md',
      '.claude/agents/doc-research.md',
      '.claude/skills/harness/SKILL.md',
      '.claude/skills/harness-intake/SKILL.md',
      '.claude/skills/harness-design/SKILL.md',
      '.claude/skills/harness-plan/SKILL.md',
      '.claude/skills/harness-tdd/SKILL.md',
      '.claude/skills/harness-verify/SKILL.md',
      'harness/config.yaml',
      'harness/templates/state.json',
      'harness/schemas/state.schema.json',
      'harness/templates/change.md',
      'harness/templates/spec.md',
      'harness/templates/requirements.md',
      'harness/templates/design.md',
      'harness/templates/tasks.md',
      'harness/templates/validation.md',
      'harness/templates/review-verdict.json',
      'harness/templates/exploration.md',
      'harness/templates/tooling-evidence.md',
      'harness/reviewers/catalog.json',
      'harness/specs/architecture.md',
      'harness/specs/workflow.md',
      'harness/specs/state-schema.md',
      'harness/specs/agents-and-handoff.md',
      'harness/specs/hooks.md',
      'harness/specs/evidence.md',
      'harness/specs/testing.md',
      'harness/specs/distribution-and-release.md',
      'harness/plugin/manifest.json',
      'harness/plugin/runtime/doctor.mjs',
      'harness/plugin/runtime/bootstrap.mjs',
      'harness/plugin/runtime/sync.mjs',
      'harness/plugin/runtime/local-adapter.example.json',
      'harness/plugin/runtime/README.md',
      'harness/plugin/runtime/lib/workflow.mjs',
    ],
  };
}

export function validateStructure(root) {
  const { dirs, files } = requiredPaths();
  const missing = [];
  for (const rel of dirs) {
    if (!fs.existsSync(path.join(root, rel)) || !fs.statSync(path.join(root, rel)).isDirectory()) {
      missing.push({ kind: 'dir', path: rel });
    }
  }
  for (const rel of files) {
    if (!fs.existsSync(path.join(root, rel)) || !fs.statSync(path.join(root, rel)).isFile()) {
      missing.push({ kind: 'file', path: rel });
    }
  }
  return missing;
}

export function normalizeDigestPath(relPath) {
  return String(relPath).replaceAll('\\', '/');
}

export function normalizeDigestContent(text) {
  return String(text).replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function collectChangeFiles(changeDir, relDir) {
  const dir = path.join(changeDir, relDir);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = normalizeDigestPath(path.join(relDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...collectChangeFiles(changeDir, relPath));
    } else {
      files.push(relPath);
    }
  }
  return files.sort();
}

export function computeValidationDigest(root, changeId) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  if (!fs.existsSync(changeDir)) return null;
  const hash = crypto.createHash('sha256');
  const statePath = path.join(changeDir, 'state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    // revision / lastEventId 是 workflow-runner 每次交互都会 bump 的易变 bookkeeping，
    // 不属于稳定验证内容；纳入 digest 会让每次 workflow 运行都误报 validation digest mismatch。
    const { revision: _revision, lastEventId: _lastEventId, ...durableState } = state;
    const normalizedState = {
      ...durableState,
      validation: {
        status: null,
        digest: null,
        validatedAt: null,
      },
    };
    hash.update('state.json\n');
    hash.update(normalizeDigestContent(JSON.stringify(normalizedState)));
    hash.update('\n');
  }
  const directFiles = ['requirements.md', 'change.md', 'design.md', 'tasks.md', 'validation.md'];
  // workflow-events.jsonl 是 append-only 事件流，会在每次 workflow 交互（含 smoke）时追加，
  // 不属于稳定验证产物；纳入 digest 会让每次 workflow 运行都误报 validation digest mismatch。
  const volatileEvidence = new Set(['evidence/workflow-events.jsonl']);
  const nestedFiles = [...collectChangeFiles(changeDir, 'reviews'), ...collectChangeFiles(changeDir, 'evidence'), ...collectChangeFiles(changeDir, 'specs')]
    .filter((relPath) => !volatileEvidence.has(normalizeDigestPath(relPath)));
  for (const relPath of [...directFiles, ...nestedFiles]) {
    const normalizedRelPath = normalizeDigestPath(relPath);
    const fullPath = path.join(changeDir, ...normalizedRelPath.split('/'));
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    hash.update(`${normalizedRelPath}\n`);
    hash.update(normalizeDigestContent(fs.readFileSync(fullPath, 'utf-8')));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function validateArtifactStates(root) {
  const changesDir = path.join(root, 'harness', 'changes');
  if (!fs.existsSync(changesDir)) return [];
  const allowedTiers = new Set(['L0', 'L1', 'L2', 'L3']);
  const allowedStates = new Set(['DRAFT','DISCOVERED','CHANGE_APPROVED','SPECIFIED','DESIGN_APPROVED','TASKED','EXECUTING','REVIEWED','VALIDATED','ARCHIVED','BLOCKED','REJECTED']);
  const designGatedStates = new Set(['TASKED','EXECUTING']);
  const allowedImpact = new Set(['yes','no','unknown']);
  const allowedValidation = new Set(['missing','fresh','stale']);
  const allowedWorkflowStages = new Set(['clarify','route','design','plan','tdd','verify','archive']);
  const allowedTddStatuses = new Set(['not-started','test-written','red-verified','green-verified','refactor-verified']);
  const errors = [];
  for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const changeDir = path.join(changesDir, entry.name);
    const statePath = path.join(changeDir, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(statePath, 'utf-8')); } catch (e) { errors.push(`${statePath}: invalid JSON`); continue; }
    for (const key of ['schemaVersion','changeId','tier','state','impact','tooling','validation']) {
      if (!(key in data)) errors.push(`${statePath}: missing ${key}`);
    }
    if (!allowedTiers.has(data.tier)) errors.push(`${statePath}: invalid tier ${data.tier}`);
    if (!allowedStates.has(data.state)) errors.push(`${statePath}: invalid state ${data.state}`);
    for (const key of ['api','data','architecture','rule']) {
      if (!allowedImpact.has(data.impact?.[key])) errors.push(`${statePath}: invalid impact.${key}`);
    }
    if (!allowedValidation.has(data.validation?.status)) errors.push(`${statePath}: invalid validation.status ${data.validation?.status}`);
    if (data.workflow) {
      if (!allowedWorkflowStages.has(data.workflow.stage)) errors.push(`${statePath}: invalid workflow.stage ${data.workflow.stage}`);
      if (typeof data.workflow.clarifyReady !== 'boolean') errors.push(`${statePath}: invalid workflow.clarifyReady`);
      if (typeof data.workflow.userConfirmedScope !== 'boolean') errors.push(`${statePath}: invalid workflow.userConfirmedScope`);
      if (typeof data.workflow.planReady !== 'boolean') errors.push(`${statePath}: invalid workflow.planReady`);
      if (!allowedTddStatuses.has(data.workflow.tddStatus)) errors.push(`${statePath}: invalid workflow.tddStatus ${data.workflow.tddStatus}`);
      if (typeof data.workflow.nextEntry !== 'string' || data.workflow.nextEntry.length === 0) errors.push(`${statePath}: invalid workflow.nextEntry`);
      if (data.workflow.clarifyReady && !data.workflow.userConfirmedScope) errors.push(`${statePath}: workflow.clarifyReady requires workflow.userConfirmedScope`);
    }
    const designPath = path.join(changeDir, 'design.md');
    const designReviewPath = path.join(changeDir, 'reviews', 'design-reviewer.json');
    const tasksPath = path.join(changeDir, 'tasks.md');
    const planReviewPath = path.join(changeDir, 'reviews', 'plan-critic.json');
    const designGateEnabled = data.gates?.designApproved === true || designGatedStates.has(data.state);
    let designReview = null;
    if (fs.existsSync(designReviewPath)) {
      try {
        designReview = JSON.parse(fs.readFileSync(designReviewPath, 'utf-8'));
      } catch {
        errors.push(`${designReviewPath}: invalid JSON`);
      }
    }
    let planReview = null;
    if (fs.existsSync(planReviewPath)) {
      try {
        planReview = JSON.parse(fs.readFileSync(planReviewPath, 'utf-8'));
      } catch {
        errors.push(`${planReviewPath}: invalid JSON`);
      }
    }
    if (designGatedStates.has(data.state) && data.gates?.designApproved !== true) {
      errors.push(`${statePath}: ${data.state} requires gates.designApproved=true`);
    }
    if (designGateEnabled && !fs.existsSync(designPath)) {
      errors.push(`${statePath}: designApproved requires design.md`);
    }
    if (designGateEnabled && !designReview) {
      errors.push(`${statePath}: designApproved requires reviews/design-reviewer.json`);
    }
    if (designReview) {
      if (designReview.changeId !== data.changeId) errors.push(`${designReviewPath}: changeId mismatch`);
      if (designReview.reviewerId !== 'design-reviewer') errors.push(`${designReviewPath}: reviewerId must be design-reviewer`);
      if (designReview.verdict === 'block') errors.push(`${designReviewPath}: block verdict prevents design approval`);
      if (!designReview.reviewedAt) errors.push(`${designReviewPath}: reviewedAt required for design approval`);
    }
    if (data.state === 'TASKED' || data.state === 'EXECUTING') {
      if (!fs.existsSync(tasksPath)) {
        errors.push(`${statePath}: ${data.state} requires tasks.md`);
      } else {
        const tasksText = fs.readFileSync(tasksPath, 'utf-8');
        if (!tasksText.startsWith('# Tasks')) {
          errors.push(`${statePath}: ${data.state} requires finalized tasks.md header (# Tasks)`);
        }
      }
      if (!planReview) {
        errors.push(`${statePath}: ${data.state} requires reviews/plan-critic.json`);
      }
    }
    if (planReview) {
      if (planReview.changeId !== data.changeId) errors.push(`${planReviewPath}: changeId mismatch`);
      if (planReview.reviewerId !== 'plan-critic') errors.push(`${planReviewPath}: reviewerId must be plan-critic`);
      if (planReview.verdict === 'block') errors.push(`${planReviewPath}: block verdict prevents TASKED/EXECUTING`);
      if (!planReview.reviewedAt) errors.push(`${planReviewPath}: reviewedAt required for TASKED/EXECUTING`);
    }
    if (data.state === 'EXECUTING' && (!data.currentTask || typeof data.currentTask !== 'string' || data.currentTask.trim().length === 0)) {
      errors.push(`${statePath}: EXECUTING requires non-empty currentTask`);
    }
    if (data.gates?.redVerified) {
      if (!data.currentTask || !String(data.currentTask).trim()) {
        errors.push(`${statePath}: redVerified requires non-empty currentTask`);
      }
      if (data.gates.redTask !== data.currentTask) {
        errors.push(`${statePath}: redVerified requires gates.redTask to match currentTask`);
      }
      if (typeof data.gates.redEvidenceRef !== 'string' || data.gates.redEvidenceRef.trim().length === 0) {
        errors.push(`${statePath}: redVerified requires non-empty gates.redEvidenceRef`);
      }
    }
    if ((data.state === 'REVIEWED' || data.state === 'VALIDATED') && data.validation?.status !== 'fresh') {
      errors.push(`${statePath}: ${data.state} requires fresh validation`);
    }
    if (data.validation?.status === 'fresh') {
      if (!data.validation.digest || typeof data.validation.digest !== 'string') {
        errors.push(`${statePath}: fresh validation requires non-empty validation.digest`);
      } else {
        const computedDigest = computeValidationDigest(root, entry.name);
        if (computedDigest && data.validation.digest !== computedDigest) {
          errors.push(`${statePath}: validation digest mismatch`);
        }
      }
      if (!data.validation.validatedAt || typeof data.validation.validatedAt !== 'string') {
        errors.push(`${statePath}: fresh validation requires non-empty validation.validatedAt`);
      }
    }
  }
  return errors;
}

function readReviewVerdictFile(file, allowed, errors) {
  if (!fs.existsSync(file)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    errors.push(`${file}: invalid JSON`);
    return null;
  }
  for (const key of ['changeId', 'reviewerId', 'verdict', 'findings', 'evidence', 'reviewedAt']) {
    if (!(key in data)) errors.push(`${file}: missing ${key}`);
  }
  if (!allowed.has(data.verdict)) errors.push(`${file}: invalid verdict ${data.verdict}`);
  return data;
}

function requiredCompletionReviewers(root, changeId, state) {
  const catalogPath = path.join(root, 'harness', 'reviewers', 'catalog.json');
  if (!fs.existsSync(catalogPath)) return [];
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  } catch {
    return [];
  }
  return catalog.filter((entry) => {
    if (!entry.blocking) return false;
    if (entry.id === 'verification-reviewer') return state.state === 'VALIDATED';
    if (entry.id === 'api-consistency-reviewer') {
      return (state.state === 'REVIEWED' || state.state === 'VALIDATED') && state.impact?.api === 'yes';
    }
    return false;
  }).map((entry) => entry.id);
}

export function validateCompletionReviewers(root, changeId, state) {
  const errors = [];
  const allowed = new Set(['pass', 'block', 'advisory']);
  for (const reviewerId of requiredCompletionReviewers(root, changeId, state)) {
    const reviewPath = path.join(root, 'harness', 'changes', changeId, 'reviews', `${reviewerId}.json`);
    const review = readReviewVerdictFile(reviewPath, allowed, errors);
    if (!review) {
      if (!fs.existsSync(reviewPath)) {
        errors.push(`${reviewPath}: missing required reviewer verdict`);
      }
      continue;
    }
    if (review.changeId !== changeId) errors.push(`${reviewPath}: changeId mismatch`);
    if (review.reviewerId !== reviewerId) errors.push(`${reviewPath}: reviewerId mismatch`);
    if (review.verdict === 'block') errors.push(`${reviewPath}: block verdict prevents ${state.state}`);
    if (!review.reviewedAt) errors.push(`${reviewPath}: reviewedAt required`);
  }
  return errors;
}

function taskIdsFromPlan(root, changeId) {
  const tasksPath = path.join(root, 'harness', 'changes', changeId, 'tasks.md');
  if (!fs.existsSync(tasksPath)) return [];
  return [...fs.readFileSync(tasksPath, 'utf-8').matchAll(/^## Task ([0-9]+):/gmu)]
    .map((match) => `task-${match[1]}`);
}

function durableAgentEvents(root, changeId) {
  const file = path.join(root, 'harness', 'changes', changeId, 'evidence', 'runtime', 'agent-events.jsonl');
  if (!fs.existsSync(file)) return { events: [], invalid: false };
  const events = [];
  let invalid = false;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { invalid = true; }
  }
  return { events, invalid };
}

function completionResult(code, status, message, targetPath = null, recovery = null) {
  return { code, status, path: targetPath, message, recovery };
}

export function validateState(root, changeId, state) {
  const results = [];
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  if (state?.state !== 'VALIDATED') {
    results.push(completionResult(
      'EH-COMPLETION-STATE-101',
      'block',
      `state must be VALIDATED, got ${state?.state}`,
      path.join(changeDir, 'state.json'),
      'complete verify and persist a fresh VALIDATED state',
    ));
  }
  for (const key of ['api', 'data', 'architecture', 'rule']) {
    if (state?.impact?.[key] === 'unknown' || !state?.impact?.[key]) {
      results.push(completionResult(
        'EH-COMPLETION-IMPACT-102',
        'block',
        `impact.${key} must be resolved`,
        path.join(changeDir, 'state.json'),
        `resolve impact.${key} during route`,
      ));
    }
  }
  if (state?.validation?.status !== 'fresh') {
    results.push(completionResult(
      'EH-COMPLETION-FRESHNESS-103',
      'block',
      'validation.status must be fresh',
      path.join(changeDir, 'validation.md'),
      'rerun validation after the latest governed change',
    ));
  }
  return results;
}

export function validateArtifacts(root, changeId, state) {
  const results = [];
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const digest = computeValidationDigest(root, changeId);
  if (!digest || state?.validation?.digest !== digest) {
    results.push(completionResult(
      'EH-COMPLETION-DIGEST-104',
      'block',
      'validation.digest is not current',
      path.join(changeDir, 'state.json'),
      'rerun verify to seal the current artifact digest',
    ));
  }
  for (const message of validateArtifactStates(root).filter((item) => item.includes(changeDir))) {
    results.push(completionResult('EH-COMPLETION-ARTIFACT-105', 'block', message, changeDir, 'repair the reported artifact state'));
  }
  for (const message of validateChangeEvidence(root).filter((item) => item.includes(changeDir))) {
    results.push(completionResult('EH-COMPLETION-EVIDENCE-106', 'block', message, changeDir, 'repair or regenerate durable evidence'));
  }
  return results;
}

export function validateReviews(root, changeId, state) {
  return validateCompletionReviewers(root, changeId, state).map((message) => completionResult(
    'EH-COMPLETION-REVIEW-107',
    'block',
    message,
    path.join(root, 'harness', 'changes', changeId, 'reviews'),
    'dispatch the required independent checker and persist its verdict',
  ));
}

export function validateTddEvidence(root, changeId) {
  const results = [];
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  const mode = evidenceModeForChange(root, changeId);
  if (!mode.ok) {
    results.push(completionResult(
      'EH-COMPLETION-POLICY-108',
      'block',
      `sealed evidence policy unavailable: ${mode.problems.join('; ')}`,
      path.join(root, 'harness', 'evidence-policy.json'),
      'initialize or migrate the target repository evidence policy',
    ));
  } else if (mode.mode === 'strict') {
    for (const taskId of taskIdsFromPlan(root, changeId)) {
      const receiptPath = path.join(changeDir, 'evidence', 'tdd', `${taskId}.json`);
      const receipt = readAndValidateTddReceipt(receiptPath, {
        root,
        changeId,
        taskId,
        allowBootstrap: taskId === 'task-1',
        requireComplete: true,
      });
      if (!receipt.ok) {
        results.push(completionResult(
          'EH-COMPLETION-TDD-109',
          'block',
          `${taskId} completion receipt invalid: ${receipt.problems.join('; ')}`,
          receiptPath,
          'run the frozen RED/GREEN/REFACTOR commands through tdd-run',
        ));
      }
    }
  }
  return results;
}

export function validateAgentLedger(root, changeId) {
  const results = [];
  const mode = evidenceModeForChange(root, changeId);
  if (!mode.ok || mode.mode !== 'strict') return results;
  const ledger = durableAgentEvents(root, changeId);
  if (ledger.invalid) {
    results.push(completionResult('EH-COMPLETION-LEDGER-110', 'block', 'agent event ledger contains invalid JSON', null, 'repair or quarantine the malformed event'));
  }
  if (ledger.events.some((event) => event.kind === 'violation')) {
    results.push(completionResult('EH-COMPLETION-VIOLATION-111', 'block', 'agent event ledger has unresolved violation', null, 'resolve the violation and create a new governed run'));
  }
  const starts = ledger.events.filter((event) => event.kind === 'start' && String(event.observedAgentType || '').startsWith('enterprise-harness:'));
  for (const start of starts) {
    const stopped = ledger.events.some((event) => event.kind === 'stop'
      && event.agentId === start.agentId
      && Date.parse(event.issuedAt) >= Date.parse(start.issuedAt));
    if (!stopped) {
      results.push(completionResult(
        'EH-COMPLETION-AGENT-112',
        'block',
        `scoped agent ${start.agentId} has no durable stop event`,
        null,
        'finish or explicitly fail the scoped run',
      ));
    }
  }
  return results;
}

export function validateApiContract(root, state) {
  if (state?.impact?.api !== 'yes') {
    return [completionResult('EH-COMPLETION-API-113', 'advisory', 'API impact is not applicable')];
  }
  const yamlFiles = findOpenApiYamlFiles(root);
  const javaFiles = findJavaControllerFiles(root);
  if (yamlFiles.length === 0 || javaFiles.length === 0) {
    return [completionResult(
      'EH-COMPLETION-API-113',
      'unsupported',
      'API impact is yes but OpenAPI or Spring controller inputs are unavailable',
      null,
      'add parseable OpenAPI and controller inputs or configure a project-specific checker',
    )];
  }
  const problems = [...validateOpenApiLight(root), ...validateGenericControllerConsistency(root)];
  return problems.length
    ? problems.map((message) => completionResult('EH-COMPLETION-API-113', 'block', message, null, 'repair the API contract mismatch'))
    : [completionResult('EH-COMPLETION-API-113', 'pass', 'API contract checks passed')];
}

export function validateTaskReviewBindings(root, changeId) {
  const results = [];
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  for (const taskId of taskIdsFromPlan(root, changeId)) {
    const reviewPath = path.join(
      changeDir,
      'reviews',
      `code-reviewer-${taskId.replace('task-', 'task')}.json`,
    );
    if (!fs.existsSync(reviewPath)) continue;
    let review;
    try {
      review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    } catch {
      results.push(completionResult(
        'EH-COMPLETION-REVIEW-114',
        'block',
        `${taskId} review is invalid JSON`,
        reviewPath,
        'regenerate the task review verdict',
      ));
      continue;
    }
    if (String(review?.verdict || '').toLowerCase() === 'block') continue;
    const receiptPath = path.join(changeDir, 'evidence', 'tdd', `${taskId}.json`);
    let importedDigest = null;
    if (fs.existsSync(receiptPath)) {
      try {
        importedDigest = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'))?.import?.sourceSpoolDigest ?? null;
      } catch {
        importedDigest = null;
      }
    }
    if (!review?.receiptDigest) {
      results.push(completionResult(
        'EH-COMPLETION-REVIEW-114',
        'block',
        `${taskId} review passed without binding an execution receipt digest`,
        reviewPath,
        'rereview the task against its imported TDD receipt and persist receiptDigest',
      ));
      continue;
    }
    if (review.receiptDigest !== importedDigest) {
      results.push(completionResult(
        'EH-COMPLETION-REVIEW-114',
        'block',
        `${taskId} review receiptDigest does not match the imported receipt`,
        reviewPath,
        'rereview the task against the currently imported TDD receipt',
      ));
    }
  }
  return results;
}

export function validateFinalCompletion(root, changeId, state) {
  return [
    ...validateState(root, changeId, state),
    ...validateArtifacts(root, changeId, state),
    ...validateReviews(root, changeId, state),
    ...validateTaskReviewBindings(root, changeId),
    ...validateTddEvidence(root, changeId),
    ...validateAgentLedger(root, changeId),
    ...validateApiContract(root, state),
  ];
}

export function validateCompletionPredicate(root, changeId, state) {
  const results = validateFinalCompletion(root, changeId, state);
  const problems = results
    .filter((item) => item.status === 'block' || item.status === 'unsupported')
    .map((item) => `${item.code}: ${item.message}${item.recovery ? `; recovery=${item.recovery}` : ''}`);
  return [...new Set(problems)];
}

export function validateReviewVerdicts(root) {
  const errors = [];
  const allowed = new Set(['pass','block','advisory']);
  const files = [path.join(root, 'harness', 'templates', 'review-verdict.json')];
  const changesDir = path.join(root, 'harness', 'changes');
  if (fs.existsSync(changesDir)) {
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const reviewsDir = path.join(changesDir, entry.name, 'reviews');
      if (!fs.existsSync(reviewsDir)) continue;
      for (const name of fs.readdirSync(reviewsDir)) files.push(path.join(reviewsDir, name));
    }
  }
  for (const file of files) {
    readReviewVerdictFile(file, allowed, errors);
  }
  if (fs.existsSync(changesDir)) {
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const statePath = path.join(changesDir, entry.name, 'state.json');
      if (!fs.existsSync(statePath)) continue;
      let state;
      try {
        state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      } catch {
        continue;
      }
      errors.push(...validateCompletionReviewers(root, entry.name, state));
      const reviewedOrValidated = state.state === 'REVIEWED' || state.state === 'VALIDATED';
      const isClarifyFirstExecution = (state.schemaVersion ?? 0) >= 3 && Boolean(state.workflow);
      if (isClarifyFirstExecution && reviewedOrValidated && state.workflow?.tddStatus === 'refactor-verified' && !hasCurrentTaskTddExecutionEvidence(state)) {
        errors.push(`${statePath}: missing TDD execution evidence (worktree + project-native build command + summary + evidence path)`);
      }
    }
  }
  return errors;
}

export function validateChangeEvidence(root) {
  const changesDir = path.join(root, 'harness', 'changes');
  if (!fs.existsSync(changesDir)) return [];
  const errors = [];
  for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const changeDir = path.join(changesDir, entry.name);
    const legacyProposal = path.join(changeDir, 'proposal.md');
    const legacyTasks = path.join(changeDir, 'tasks.md');
    const statePath = path.join(changeDir, 'state.json');
    if ((fs.existsSync(legacyProposal) || fs.existsSync(legacyTasks)) && !fs.existsSync(statePath)) continue;
    for (const rel of ['state.json','change.md','validation.md', path.join('evidence','tooling.md')]) {
      const full = path.join(changeDir, rel);
      if (!fs.existsSync(full)) errors.push(`${changeDir}: missing ${rel}`);
    }

    let state = null;
    if (fs.existsSync(statePath)) {
      try {
        state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      } catch {
        state = null;
      }
    }
    const ambiguityProblems = validateAmbiguityGate(root, entry.name, state);
    if (ambiguityProblems.length > 0) {
      errors.push(...ambiguityProblems.map((problem) => `${changeDir}: ${problem}`));
    }
    const routerProblems = validateRouterScore(root, entry.name, state);
    if (routerProblems.length > 0) {
      errors.push(...routerProblems.map((problem) => `${changeDir}: ${problem}`));
    }

    const validationPath = path.join(changeDir, 'validation.md');
    // DRAFT scaffold 的 validation.md 是空模板；验证证据要到 verify 阶段才存在。
    if (state?.state !== 'DRAFT' && fs.existsSync(validationPath)) {
      const text = fs.readFileSync(validationPath, 'utf-8');
      if (!text.includes('## Commands Executed')) {
        errors.push(`${changeDir}: validation.md missing Commands Executed section`);
      }
      if (!text.includes('## Final Verdict')) {
        errors.push(`${changeDir}: validation.md missing Final Verdict section`);
      }
      if (!text.includes('## Stage Gate Summary')) {
        errors.push(`${changeDir}: validation.md missing Stage Gate Summary section`);
      }
      const commandsMatch = text.match(/## Commands Executed\n([\s\S]*?)(\n## |$)/);
      if (commandsMatch && !commandsMatch[1].trim()) {
        errors.push(`${changeDir}: validation.md Commands Executed section is empty`);
      }
      const verdictMatch = text.match(/## Final Verdict\n([\s\S]*?)(\n## |$)/);
      if (verdictMatch && !verdictMatch[1].trim()) {
        errors.push(`${changeDir}: validation.md Final Verdict section is empty`);
      }
      const reviewVerdictsMatch = text.match(/## Review Verdicts\n([\s\S]*?)(\n## |$)/);
      const reviewVerdictsText = (reviewVerdictsMatch?.[1] || '').trim();
      if (reviewVerdictsMatch && !reviewVerdictsText) {
        errors.push(`${changeDir}: validation.md Review Verdicts section is empty`);
      }
      if (reviewVerdictsText && state) {
        const requiredReviewers = validateCompletionReviewers(root, entry.name, state)
          .map((problem) => {
            const match = problem.match(/required reviewer ([a-z-]+)/i);
            return match ? match[1] : null;
          })
          .filter(Boolean);
        const reviewFilesDir = path.join(changeDir, 'reviews');
        let reviewFiles = [];
        if (fs.existsSync(reviewFilesDir)) {
          reviewFiles = fs.readdirSync(reviewFilesDir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => name.replace(/\.json$/, ''));
        }
        const mustMention = new Set([...requiredReviewers, ...reviewFiles]);
        function normalizeReviewerMention(text) {
          return String(text || '')
            .toLowerCase()
            .replace(/`/g, '')
            .replace(/：/g, ':')
            .replace(/\btask\s+/g, 'task')
            .replace(/\s+/g, ' ')
            .trim();
        }
        const normalizedReviewText = normalizeReviewerMention(reviewVerdictsText);
        for (const reviewerId of mustMention) {
          const normalizedReviewerId = normalizeReviewerMention(reviewerId);
          const reviewerIdWithTaskSpacing = normalizedReviewerId.replace(/-task([0-9a-z]+)/g, ' task$1');
          const reviewerIdWithSpaces = normalizedReviewerId.replace(/-/g, ' ');
          if (!normalizedReviewText.includes(normalizedReviewerId)
            && !normalizedReviewText.includes(reviewerIdWithTaskSpacing)
            && !normalizedReviewText.includes(reviewerIdWithSpaces)) {
            errors.push(`${changeDir}: validation.md Review Verdicts section does not mention required reviewer ${reviewerId}`);
          }
        }
      }
      const failuresMatch = text.match(/## Failures and Retries\n([\s\S]*?)(\n## |$)/);
      const skippedMatch = text.match(/## Skipped Checks\n([\s\S]*?)(\n## |$)/);
      const verdictText = (verdictMatch?.[1] || '').trim().toLowerCase();
      const failuresText = (failuresMatch?.[1] || '').trim();
      const skippedText = (skippedMatch?.[1] || '').trim();
      const failuresLower = failuresText.toLowerCase();
      const hasFailureDetails = failuresText && !['none', 'n/a', '无', '无失败', '无重试'].includes(failuresLower);
      const hasResolvedFailureLanguage = /已修复|已收口|已解决|重试完成|不构成当前未解决 blocker|当前不存在未解决 blocker/.test(failuresText);
      const hasSkippedDetails = skippedText && !['none', 'n/a', '无', '无跳过'].includes(skippedText.toLowerCase());
      const verdictClaimsPass = /\bpass\b|\bsuccess\b|通过|全绿/.test(verdictText);
      if (hasFailureDetails && !hasResolvedFailureLanguage && verdictClaimsPass) {
        errors.push(`${changeDir}: validation.md Final Verdict claims pass while Failures and Retries contains unresolved content`);
      }
      if (hasSkippedDetails && !/skip|defer|advisory|说明|解释|豁免/.test(verdictText)) {
        errors.push(`${changeDir}: validation.md Final Verdict does not explain non-empty Skipped Checks`);
      }
    }
  }
  return errors;
}

export function activeChangeInfo(root) {
  const file = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(file)) return { ok: false, message: '当前没有 active change。' };
  const changeId = fs.readFileSync(file, 'utf-8').trim();
  return { ok: changeId.length > 0, message: changeId || 'ACTIVE_CHANGE 为空。' };
}

function findOpenApiYamlFiles(root) {
  const results = [];
  const seen = new Set();

  function visit(dir, depth) {
    if (depth > 12) return;

    const resolvedDir = path.resolve(dir);
    if (seen.has(resolvedDir)) return;
    seen.add(resolvedDir);

    let entries;
    try {
      entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    } catch {
      return;
    }

    const dirName = path.basename(resolvedDir);
    if (dirName === 'openapi') {
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
        results.push(path.join(resolvedDir, entry.name));
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (GOVERNANCE_BLOCKLIST.has(entry.name)) continue;
      visit(path.join(resolvedDir, entry.name), depth + 1);
    }
  }

  visit(root, 0);
  return results;
}

export function validateOpenApiLight(root) {
  const files = findOpenApiYamlFiles(root);
  const errors = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8');
    const relPath = normalizeDigestPath(path.relative(root, file));
    for (const pattern of [/^openapi:\s*3\.\d+(?:\.\d+)?\s*$/m, /^paths:\s*(?:$|\n)/m]) {
      if (!pattern.test(text)) errors.push(`openapi:${relPath}:${pattern.toString()}`);
    }
    if (/^paths:\s*\{\s*\}\s*$/m.test(text) || parseOpenApiPaths(text).size === 0) {
      errors.push(`openapi:${relPath}:unsupported:no-parseable-paths`);
    }
  }
  return errors;
}

// ── Generic OpenAPI ↔ Controller Consistency Checker ──

function findJavaControllerFiles(root) {
  const results = [];
  const seen = new Set();

  function visit(dir, depth) {
    if (depth > 12) return;
    const resolvedDir = path.resolve(dir);
    if (seen.has(resolvedDir)) return;
    seen.add(resolvedDir);

    let entries;
    try { entries = fs.readdirSync(resolvedDir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        if (entry.isFile() && entry.name.endsWith('Controller.java')) {
          results.push(path.join(resolvedDir, entry.name));
        }
        continue;
      }
      if (GOVERNANCE_BLOCKLIST.has(entry.name)) continue;
      visit(path.join(resolvedDir, entry.name), depth + 1);
    }
  }

  visit(root, 0);
  return results;
}

/**
 * 解析 OpenAPI YAML，提取所有 paths + methods + request/response schema 名。
 * 使用 regex 提取，不依赖外部 YAML parser。
 * 返回 Map<path, Map<method, { requestBody?: string, responseSchemas: string[] }>>
 */
function parseOpenApiPaths(yamlText) {
  const result = new Map();

  // 按路径分割 YAML：找到顶层 paths 下的每个 /path: 块
  // 匹配格式：  /some/path:  （两个空格缩进 + 路径 + 冒号）
  const lines = yamlText.split('\n');
  let currentPath = null;
  let currentMethod = null;
  let inPaths = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测 paths: 顶层 key
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }

    if (!inPaths) continue;

    // 顶层 key 切换（如 components:）→ 退出 paths 区域
    if (/^[a-z]/.test(line) && !/^\s/.test(line) && line.trim().length > 0) {
      inPaths = false;
      currentPath = null;
      currentMethod = null;
      continue;
    }

    // 检测路径行：  /api/orders/{orderId}/cancel:
    const pathMatch = line.match(/^  (\/\S+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = null;
      if (!result.has(currentPath)) result.set(currentPath, new Map());
      continue;
    }

    if (!currentPath) continue;

    // 检测方法行：    get: / post: / put: / delete: / patch:
    const methodMatch = line.match(/^    (get|post|put|delete|patch|head|options):\s*$/);
    if (methodMatch) {
      currentMethod = methodMatch[1];
      result.get(currentPath).set(currentMethod, { requestBody: null, responseSchemas: [] });
      continue;
    }

    if (!currentMethod) continue;

    // 在当前 method 块内提取 requestBody schema $ref
    const schemaRefMatch = line.match(/\$ref:\s*['"]?#\/components\/schemas\/(\w+)['"]?/);
    if (schemaRefMatch) {
      const entry = result.get(currentPath).get(currentMethod);
      if (!entry.requestBody) {
        entry.requestBody = schemaRefMatch[1];
      }
    }
  }

  return result;
}

/**
 * 解析 Java Controller 源码，提取 class-level @RequestMapping + method-level @XxxMapping。
 * 返回 Map<fullPath, Map<method, { source: string }>>
 */
function parseControllerMappings(javaText) {
  const result = new Map();

  // 提取 class-level @RequestMapping("...")
  const classMappingMatch = javaText.match(/@RequestMapping\s*\(\s*"([^"]+)"\s*\)/);
  const basePath = classMappingMatch ? classMappingMatch[1] : '';

  // 提取方法级 @XxxMapping("...")
  const methodPatterns = [
    { method: 'get', regex: /@GetMapping\s*\(\s*"([^"]+)"\s*\)/g },
    { method: 'post', regex: /@PostMapping\s*\(\s*"([^"]+)"\s*\)/g },
    { method: 'put', regex: /@PutMapping\s*\(\s*"([^"]+)"\s*\)/g },
    { method: 'delete', regex: /@DeleteMapping\s*\(\s*"([^"]+)"\s*\)/g },
    { method: 'patch', regex: /@PatchMapping\s*\(\s*"([^"]+)"\s*\)/g },
    // @RequestMapping + method=RequestMethod.XXX（method-level）
    { method: 'request', regex: /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]+)"\s*,\s*method\s*=\s*RequestMethod\.(GET|POST|PUT|DELETE|PATCH)\s*\)/g },
  ];

  for (const { method, regex } of methodPatterns) {
    let match;
    while ((match = regex.exec(javaText)) !== null) {
      const methodPath = match[1];
      const fullPath = basePath + methodPath;
      let effectiveMethod = method;
      if (method === 'request' && match[2]) {
        effectiveMethod = match[2].toLowerCase();
      }
      if (!result.has(fullPath)) result.set(fullPath, new Map());
      result.get(fullPath).set(effectiveMethod, { source: 'controller' });
    }
  }

  return result;
}

/**
 * 通用 OpenAPI ↔ Controller 一致性检查器。
 * 扫描项目中所有 openapi/*.yaml 与 *Controller.java，做 path + method 对齐校验。
 *
 * 返回 error 字符串数组，空数组表示一致或无内容可检查。
 */
export function validateGenericControllerConsistency(root) {
  const yamlFiles = findOpenApiYamlFiles(root);
  const javaFiles = findJavaControllerFiles(root);
  if (yamlFiles.length === 0 || javaFiles.length === 0) return [];

  // 收集所有 YAML paths + methods
  const yamlPaths = new Map();
  for (const file of yamlFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    const relPath = normalizeDigestPath(path.relative(root, file));
    const paths = parseOpenApiPaths(text);
    for (const [p, methods] of paths) {
      for (const [m, info] of methods) {
        const key = `${p} ${m}`;
        yamlPaths.set(key, { file: relPath, ...info });
      }
    }
  }

  // 收集所有 Controller paths + methods
  const controllerPaths = new Map();
  for (const file of javaFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    const relPath = normalizeDigestPath(path.relative(root, file));
    const paths = parseControllerMappings(text);
    for (const [p, methods] of paths) {
      for (const [m, info] of methods) {
        const key = `${p} ${m}`;
        controllerPaths.set(key, { file: relPath, ...info });
      }
    }
  }

  if (yamlPaths.size === 0) {
    return ['openapi-controller:unsupported:no-parseable-openapi-paths'];
  }
  if (controllerPaths.size === 0) {
    return ['openapi-controller:unsupported:no-parseable-spring-mappings'];
  }

  const errors = [];

  // YAML 里有但 Controller 里没有的 path+method
  for (const [key, yamlInfo] of yamlPaths) {
    if (!controllerPaths.has(key)) {
      const [p, m] = key.split(' ');
      errors.push(`openapi-controller:path-missing-in-controller:${yamlInfo.file}:${m.toUpperCase()} ${p}`);
    }
  }

  // Controller 里有但 YAML 里没有的 path+method
  for (const [key, ctrlInfo] of controllerPaths) {
    if (!yamlPaths.has(key)) {
      const [p, m] = key.split(' ');
      errors.push(`openapi-controller:method-missing-in-openapi:${ctrlInfo.file}:${m.toUpperCase()} ${p}`);
    }
  }

  return errors;
}

// 注意：这是 reference-service 自身的 demo 回归检查（硬编码 OrderCancellationController 的路径/注解语义），
// 不是通用的任意项目 OpenAPI-Controller 交叉一致性校验器。真正的通用校验器需要解析任意 OpenAPI `paths`
// 与任意 Spring `@RequestMapping`/`@GetMapping`/... 注解并做双向比对，是独立的、更大的后续 initiative。
export function validateReferenceServiceControllerConsistency(root) {
  const yamlFile = path.join(root, 'reference-service', 'openapi', 'order-service.yaml');
  const controllerFile = path.join(root, 'reference-service', 'src', 'main', 'java', 'com', 'example', 'orders', 'interfaces', 'api', 'OrderCancellationController.java');
  if (!fs.existsSync(yamlFile) || !fs.existsSync(controllerFile)) return [];
  const yaml = fs.readFileSync(yamlFile, 'utf-8');
  const controller = fs.readFileSync(controllerFile, 'utf-8');
  const errors = [];
  if (!yaml.includes('/api/orders/{orderId}/cancel:')) errors.push('controller:path-missing-in-yaml');
  if (!/^\s+post:/m.test(yaml)) errors.push('controller:post-missing-in-yaml');
  if (!controller.includes('@RequestMapping("/api/orders")')) errors.push('controller:base-mapping-missing');
  if (!controller.includes('@PostMapping("/{orderId}/cancel")')) errors.push('controller:post-mapping-missing');
  return errors;
}
