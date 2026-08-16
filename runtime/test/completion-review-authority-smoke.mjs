import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { validateReviews } from '../lib/checks.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-completion-review-authority-'));
const changeId = 'structured-review';

try {
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'policy.json'), JSON.stringify({
    completionReviewers: ['verification-reviewer'],
  }));

  const state = {
    schemaVersion: 6,
    changeId,
    stage: 'verify',
  };
  assert.deepEqual(
    validateReviews(root, changeId, state),
    [],
    'State v6 must use structured ReviewResult gates, not reviews/*.json projections from policy.json',
  );

  if (mode === 'red') {
    console.error('Expected v6 completion review authority test to fail before implementation.');
    process.exitCode = 1;
  } else {
    console.log(`PASS completion-review-authority ${mode}`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
