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
      '.claude/skills/harness-intake',
      'hooks',
      'harness',
      'harness/templates',
      'harness/changes',
      'harness/specs',
      'harness/reviewers',
      'harness/plugin/runtime',
    ],
    files: [
      'CLAUDE.md',
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
      '.claude/skills/harness-intake/SKILL.md',
      'harness/config.yaml',
      'harness/templates/state.json',
      'harness/templates/change.md',
      'harness/templates/spec.md',
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

export function validateArtifactStates(root) {
  const changesDir = path.join(root, 'harness', 'changes');
  if (!fs.existsSync(changesDir)) return [];
  const allowedTiers = new Set(['L0', 'L1', 'L2', 'L3']);
  const allowedStates = new Set(['DRAFT','DISCOVERED','CHANGE_APPROVED','SPECIFIED','DESIGN_APPROVED','TASKED','EXECUTING','REVIEWED','VALIDATED','ARCHIVED','BLOCKED','REJECTED']);
  const allowedImpact = new Set(['yes','no','unknown']);
  const allowedValidation = new Set(['missing','fresh','stale']);
  const errors = [];
  for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const statePath = path.join(changesDir, entry.name, 'state.json');
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
    if (data.state === 'VALIDATED' && data.validation?.status !== 'fresh') errors.push(`${statePath}: VALIDATED requires fresh validation`);
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
    if (!fs.existsSync(file)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { errors.push(`${file}: invalid JSON`); continue; }
    for (const key of ['changeId','reviewerId','verdict','findings','evidence']) {
      if (!(key in data)) errors.push(`${file}: missing ${key}`);
    }
    if (!allowed.has(data.verdict)) errors.push(`${file}: invalid verdict ${data.verdict}`);
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
