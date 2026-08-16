import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindSession } from '../lib/sessions.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import { activeChangeInfo } from '../lib/checks.mjs';
import { buildStatusSummary } from '../lib/status-summary.mjs';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-session-first-diagnostics-'));
const changeId = 'session-bound-change';
const sessionId = 'diagnostic-session';
const stateDir = path.join(root, 'harness', 'changes', changeId);
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'stale-repo-wide-change\n', 'utf-8');
const classification = writeClassificationArtifact(root, changeId, {
  tier: 'L1',
  impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  requiredReviews: ['requirements'],
});
fs.writeFileSync(path.join(stateDir, 'state.json'), `${JSON.stringify({
  schemaVersion: 6,
  changeId,
  lifecycle: 'active',
  state: 'ACTIVE',
  workflow: { stage: 'clarify' },
  artifacts: { classification },
  validation: { status: 'missing', digest: null, validatedAt: null, invalidatedAt: null },
}, null, 2)}\n`, 'utf-8');

bindSession(root, {
  sessionId,
  changeId,
  worktreePath: root,
  subjectRoot: root,
  controllerRevision: 'test-controller',
}, { commonDir: path.join(root, '.git') });

const active = loadActiveChange(root, { sessionId, commonDir: path.join(root, '.git') });
assert.equal(active.ok, true);
assert.equal(active.changeId, changeId);
assert.equal(activeChangeInfo(root, { sessionId, commonDir: path.join(root, '.git') }).changeId, changeId);

const summary = buildStatusSummary(root, { sessionId, commonDir: path.join(root, '.git') });
assert.equal(summary.activeChange.changeId, changeId);
assert.match(summary.truthSources[0].note, /session binding/i);
assert.ok(summary.truthSources[0].paths.includes('harness/ACTIVE_CHANGE'));

console.log('PASS session-first diagnostics smoke');
