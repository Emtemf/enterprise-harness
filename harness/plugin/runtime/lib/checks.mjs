import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function projectRoot() {
  return process.cwd();
}

export function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
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
      'PROGRESS.md',
      '.mcp.json',
      '.claude/settings.json',
      '.claude/rules/00-workflow.md',
      '.claude/rules/10-code-analysis.md',
      '.claude/rules/20-documentation.md',
      '.claude/rules/30-java-architecture.md',
      '.claude/rules/40-java-style.md',
      '.claude/rules/50-testing.md',
      '.claude/rules/60-api-contract.md',
      '.claude/rules/70-review.md',
      '.claude/agents/requirement-reviewer.md',
      '.claude/agents/design-reviewer.md',
      '.claude/agents/plan-critic.md',
      '.claude/agents/api-consistency-reviewer.md',
      '.claude/agents/verification-reviewer.md',
      '.claude/agents/code-explore.md',
      '.claude/agents/doc-research.md',
      '.claude/agents/impact-explore.md',
      '.claude/skills/harness/SKILL.md',
      '.claude/skills/harness-intake/SKILL.md',
      '.claude/skills/harness-design/SKILL.md',
      '.claude/skills/harness-plan/SKILL.md',
      '.claude/skills/harness-tdd/SKILL.md',
      '.claude/skills/harness-verify/SKILL.md',
      'harness/config.yaml',
      'harness/templates/state.json',
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
      'harness/specs/instruction-layering.md',
      'harness/specs/directory-model.md',
      'harness/specs/artifact-lifecycle.md',
      'harness/specs/requirement-intake.md',
      'harness/specs/tool-fallback-policy.md',
      'harness/specs/evidence-submission.md',
      'harness/specs/containerization-sandboxing.md',
      'harness/specs/session-lifecycle.md',
      'harness/specs/staged-workflow.md',
      'harness/specs/plugin-runtime.md',
      'harness/specs/local-runtime-adapter.md',
      'harness/bin/create-change-scaffold.sh',
      'harness/bin/create-exploration-artifact.sh',
      'harness/bin/update-change-state.sh',
      'harness/bin/set-active-change.sh',
      'harness/bin/show-active-change.sh',
      'harness/bin/set-change-impact.sh',
      'harness/bin/record-review-verdict.sh',
      'harness/bin/mark-change-reviewed.sh',
      'harness/bin/mark-change-validated.sh',
      'harness/bin/context7-library.sh',
      'harness/bin/context7-docs.sh',
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
    const normalizedState = {
      ...state,
      validation: {
        status: null,
        digest: null,
        validatedAt: null,
      },
    };
    hash.update('state.json\n');
    hash.update(JSON.stringify(normalizedState));
    hash.update('\n');
  }
  const directFiles = ['requirements.md', 'change.md', 'design.md', 'tasks.md', 'validation.md'];
  const nestedFiles = [...collectChangeFiles(changeDir, 'reviews'), ...collectChangeFiles(changeDir, 'evidence'), ...collectChangeFiles(changeDir, 'specs')];
  for (const relPath of [...directFiles, ...nestedFiles]) {
    const normalizedRelPath = normalizeDigestPath(relPath);
    const fullPath = path.join(changeDir, ...normalizedRelPath.split('/'));
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
    hash.update(`${normalizedRelPath}\n`);
    hash.update(fs.readFileSync(fullPath, 'utf-8'));
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
  }
  return errors;
}

export function activeChangeInfo(root) {
  const file = path.join(root, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(file)) return { ok: false, message: '当前没有 active change。' };
  const changeId = fs.readFileSync(file, 'utf-8').trim();
  return { ok: changeId.length > 0, message: changeId || 'ACTIVE_CHANGE 为空。' };
}

export function validateOpenApiLight(root) {
  const file = path.join(root, 'reference-service', 'openapi', 'order-service.yaml');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf-8');
  const errors = [];
  for (const pattern of [/^openapi:/m, /^paths:/m, /^components:/m]) {
    if (!pattern.test(text)) errors.push(`openapi:${pattern.toString()}`);
  }
  return errors;
}

export function validateControllerConsistency(root) {
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
