import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifyPath = path.join(repoRoot, 'runtime', 'verify.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph' || entry.name === '.bun' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.cache') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/verify-review-verdict-summary-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-review-verdict-summary-'));
const repoCopy = path.join(tempRoot, 'repo');
try {
  copyDir(repoRoot, repoCopy);
  const change = 'review-validation-missing-api-review';
  const changeDir = path.join(repoCopy, 'harness', 'changes', change);
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 3,
    changeId: change,
    tier: 'L2',
    state: 'REVIEWED',
    impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no' },
    tooling: {
      codegraph: { status: 'available', queries: ['fixture'], fallbackReason: null },
      documentation: { status: 'unknown', libraries: [] },
    },
    decisions: [], blockers: [], approvals: {}, currentTask: null,
    gates: { designApproved: true, redVerified: true, redTask: 't1', redEvidenceRef: 'evidence/red.md' },
    workflow: { stage: 'verify', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'refactor-verified', nextEntry: '/harness-verify' },
    tddEvidence: { worktreeUsed: true, commandExecuted: 'mvn test', commandOutputSummary: 'BUILD SUCCESS', evidencePath: 'evidence/tdd.md' },
    validation: { status: 'fresh', digest: null, validatedAt: '2026-07-27' }
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n\n## 初步路由\n\n### Router 评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| Scope complexity | 4 | ok |\n| Impact breadth | 4 | ok |\n| Unknowns / ambiguity | 4 | ok |\n| API / data risk | 5 | api |\n| Test / rollback complexity | 4 | ok |\n| **Overall** | 4 | ok |\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n\n## E 证据\n\n### 歧义评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| T 目标 clarity | 4 | ok |\n| Scope clarity | 4 | ok |\n| User/actor clarity | 4 | ok |\n| Data/SQL clarity | 4 | ok |\n| Interface/API clarity | 4 | ok |\n| Acceptance criteria clarity | 4 | ok |\n| Constraint/risk clarity | 4 | ok |\n| **Overall** | 4 | ok |\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), `# Validation\n\n## Commands Executed\n- mvn test\n\n## Review Verdicts\n- design-reviewer: pass\n\n## Stage Gate Summary\n- verify: ready\n\n## Skipped Checks\n- none\n\n## Failures and Retries\n- none\n\n## Final Verdict\npass\n`, 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'reviews', 'design-reviewer.json'), JSON.stringify({ changeId: change, reviewerId: 'design-reviewer', verdict: 'pass', findings: [], evidence: ['fixture'], reviewedAt: '2026-07-27' }, null, 2) + '\n');
  fs.writeFileSync(path.join(changeDir, 'reviews', 'verification-reviewer.json'), JSON.stringify({ changeId: change, reviewerId: 'verification-reviewer', verdict: 'pass', findings: [], evidence: ['fixture'], reviewedAt: '2026-07-27' }, null, 2) + '\n');
  fs.writeFileSync(path.join(changeDir, 'reviews', 'api-consistency-reviewer.json'), JSON.stringify({ changeId: change, reviewerId: 'api-consistency-reviewer', verdict: 'pass', findings: [], evidence: ['fixture'], reviewedAt: '2026-07-27' }, null, 2) + '\n');

  const result = spawnSync('node', [verifyPath, '--json'], { cwd: repoCopy, encoding: 'utf-8' });
  const parsed = JSON.parse(result.stdout || '{}');
  const problems = parsed?.contractChecks?.problems || [];
  const ok = problems.some((p) => p.includes('validation.md Review Verdicts section does not mention required reviewer api-consistency-reviewer'))
    && problems.some((p) => p.includes('validation.md Review Verdicts section does not mention required reviewer verification-reviewer'));

  if (mode === 'red') {
    if (!ok) {
      fail('Expected verify to require validation.md Review Verdicts to mention required reviewer verdicts');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected verify to require validation.md Review Verdicts to mention required reviewer verdicts');
  }

  pass(mode === 'green' ? 'Green verify review verdict summary smoke passed.' : 'Verify review verdict summary smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
