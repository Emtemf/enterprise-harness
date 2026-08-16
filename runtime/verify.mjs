import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, validateStructure, validateArtifactStates, validateReviewVerdicts, validateChangeEvidence, validateOpenApiLight, validateGenericControllerConsistency, validateCompletionPredicate } from './lib/checks.mjs';
import { loadActiveChange } from './lib/gates.mjs';
import { renderTECPCCard } from './lib/tecp-card.mjs';
import { buildWorkflowResult } from './lib/workflow.mjs';

const root = projectRoot();
const releaseSurface = process.argv.includes('--release-surface');
const DEVELOPMENT_ONLY_REQUIRED_PATHS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/settings.json',
  'harness/changes',
  'harness/policy.json',
]);

// 发布包刻意不包含开发态 change 与源仓库 policy。开发验证仍必须审计这些
// 资产；发布验证只审计会进入包的 runtime、spec、template 与 plugin 合同，不能让
// 一个未归档的 change 伪装成已发布内容，也不能反向要求发布包携带源策略。
function validateReleaseSurfaceStructure(repoRoot) {
  return validateStructure(repoRoot)
    .filter((missing) => !DEVELOPMENT_ONLY_REQUIRED_PATHS.has(missing.path));
}

// 版本一致性检查：package.json / manifest.json / .claude-plugin/plugin.json 必须一致
function validateVersionConsistency(repoRoot) {
  const errors = [];
  const files = [
    ['package.json', 'version'],
    ['harness/plugin/manifest.json', 'version'],
    ['.claude-plugin/plugin.json', 'version'],
  ];
  const versions = {};
  for (const [rel, key] of files) {
    const fullPath = path.join(repoRoot, rel);
    if (!fs.existsSync(fullPath)) {
      errors.push(`version-consistency: missing ${rel}`);
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      versions[rel] = data[key];
    } catch {
      errors.push(`version-consistency: ${rel} invalid JSON`);
    }
  }
  const unique = new Set(Object.values(versions));
  if (unique.size > 1) {
    const detail = Object.entries(versions).map(([f, v]) => `${f}=${v}`).join(', ');
    errors.push(`version-consistency: version mismatch (${detail})`);
  }
  return errors;
}

const activeForCompletion = loadActiveChange(root);
const developmentChangeProblems = releaseSurface
  ? []
  : [
      ...validateArtifactStates(root),
      ...validateReviewVerdicts(root),
      ...validateChangeEvidence(root),
      ...(activeForCompletion.ok && activeForCompletion.data.state === 'VALIDATED'
        ? validateCompletionPredicate(root, activeForCompletion.changeId, activeForCompletion.data)
          .map((problem) => `completion:${problem}`)
        : []),
    ];
const problems = [
  ...validateVersionConsistency(root),
  ...(releaseSurface ? validateReleaseSurfaceStructure(root) : validateStructure(root)).map((m) => `${m.kind}:${m.path}`),
  ...validateOpenApiLight(root),
  ...validateGenericControllerConsistency(root),
  ...developmentChangeProblems,
];

const templateDir = path.join(root, 'harness', 'templates');
const todoHits = [];
if (fs.existsSync(templateDir)) {
  for (const name of fs.readdirSync(templateDir)) {
    const full = path.join(templateDir, name);
    const text = fs.readFileSync(full, 'utf-8');
    if (text.includes('TODO') || text.includes('TBD')) {
      todoHits.push(full);
    }
  }
}

const contractChecks = {
  ok: problems.length === 0 && todoHits.length === 0,
  problems,
  todoHits,
};

const runtimeReadinessChecks = {
  ok: false,
  status: 'not-run',
  guidance: [
    'doctor --json',
    'sync --json',
    'upstream-check --json',
  ],
};

const completionVerdict = contractChecks.ok ? 'pass' : 'block';
const blockers = contractChecks.ok
  ? []
  : [
      ...contractChecks.problems.map((problem) => `contract-problem:${problem}`),
      ...contractChecks.todoHits.map((file) => `template-placeholder:${file}`),
    ];
const consumedEvidenceSummary = {
  contractProblems: contractChecks.problems.length,
  todoHits: contractChecks.todoHits.length,
  runtimeReadinessStatus: runtimeReadinessChecks.status,
  developmentChangeValidationSkipped: releaseSurface,
};
const nextStep = contractChecks.ok
  ? 'archive-or-completion-gate'
  : 'fix-contract-problems-and-rerun-verify';

const result = {
  repoRoot: root,
  scope: releaseSurface ? 'release-surface' : 'development',
  ok: contractChecks.ok,
  'completion-verdict': completionVerdict,
  blockers,
  'consumed-evidence-summary': consumedEvidenceSummary,
  'next-step': nextStep,
  contractChecks,
  runtimeReadinessChecks,
};

const jsonMode = process.argv.includes('--json');
if (jsonMode) {
  const payload = JSON.stringify(result, null, 2) + '\n';
  await new Promise((resolve) => {
    if (process.stdout.write(payload)) resolve();
    else process.stdout.once('drain', resolve);
  });
} else {
  console.log('Enterprise Harness Verify');
  if (contractChecks.ok) {
    console.log('OK contract checks passed.');
  } else {
    for (const p of contractChecks.problems) console.log(`FAIL ${p}`);
    for (const t of contractChecks.todoHits) console.log(`FAIL template-placeholder ${t}`);
  }
  console.log('runtime readiness requires separate commands: doctor --json, sync --json, upstream-check --json');

  // 闭环五检进度卡
  try {
    const active = loadActiveChange(root);
    if (active.ok) {
      const card = renderTECPCCard(root, active.changeId, active.data, {
        workflowResult: buildWorkflowResult(root, active.changeId, active.data),
      });
      console.log(card);
    }
  } catch (error) {
    console.log(`WARN EH-VERIFY-TECP-015 ${error.message}`);
  }
}
process.exitCode = result.ok ? 0 : 1;
