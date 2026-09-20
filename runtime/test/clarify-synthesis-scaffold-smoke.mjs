import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  inspectClarifySynthesisSources,
  persistClarifySynthesis,
  synthesisInputPath,
} from '../core/clarify-governance.mjs';
import { analyzeClarifyRequirements } from '../lib/clarify-readiness.mjs';
import { readClarifyResearchEvidence } from '../lib/clarify-research-evidence.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';
import {
  appendLaneApplicabilityFixture,
  appendQuestionSynthesisFixture,
  ensureRequiredCodeResearchFixture,
} from './classification-v2-fixture.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-synthesis-scaffold-'));
const changeId = 'refund-synthesis';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const inputRef = synthesisInputPath(changeId);

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
}

function writeJson(ref, value) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

try {
  git(['init', '--quiet']);
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  const rawRequest = 'Clarify the self-service refund policy.';
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), [
    '# Requirements', '', '## 目标与验收', '### 原始需求', `> ${rawRequest}`,
    '### 澄清后的目标', 'Clarify refund policy.', '', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | pending classification |',
    '| docs | no | none | none | none | not-required | no external facts required |',
    '- remaining fact uncertainty: none', '',
  ].join('\n'), 'utf-8');
  const sessionId = `fixture-${changeId}`;
  recordPromptReceipt(root, { session_id: sessionId, prompt: rawRequest });
  bindLatestPromptReceipt(root, changeId, sessionId);
  ensureRequiredCodeResearchFixture(root, changeId, requirementsRef);
  appendQuestionSynthesisFixture(root, changeId, requirementsRef);
  fs.appendFileSync(path.join(root, requirementsRef), '\n## Decision refs\n\nfixture\n', 'utf-8');
  appendLaneApplicabilityFixture(root, changeId, requirementsRef, { code: 'required', docs: 'not-required' });

  const projection = inspectClarifySynthesisSources(root, changeId);
  assert.match(projection.sourceDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(projection.sources.map(({ sourceId }) => sourceId), ['RAW-1', 'CODE-1']);
  const input = {
    synthesisVersion: 1,
    type: 'clarify-synthesis-input',
    changeId,
    sourceDigest: projection.sourceDigest,
    components: [{
      componentId: 'refund',
      boundary: 'Self-service refund policy outcome.',
      status: 'active',
      dependsOn: 'none',
      confirmationSourceId: 'RAW-1',
    }],
    assignments: [
      { evidenceId: 'E-RAW-1', sourceId: 'RAW-1', componentId: 'refund', dimension: 'Goal', predicate: 'outcome' },
      { evidenceId: 'E-CODE-1', sourceId: 'CODE-1', componentId: 'refund', dimension: 'Context', predicate: 'current-state' },
    ],
    frontier: {
      componentId: 'refund',
      dimension: 'Constraints',
      risk: 'high',
      nextAction: 'ask',
      knownFact: 'The code boundary is known; the failure policy is not authorized.',
      question: '退款失败后订单保持原状态还是进入待处理状态？',
      recommendationReason: 'Keeping the original state avoids reporting an unconfirmed refund.',
    },
  };
  writeJson(inputRef, input);
  const result = persistClarifySynthesis(root, changeId, inputRef);
  assert.equal(result.frontier.component, 'refund');
  assert.equal(result.frontier.dimension, 'Constraints');
  assert.equal(result.frontier.currentScore, 0);
  const content = fs.readFileSync(path.join(root, requirementsRef), 'utf-8');
  assert.match(content, /\| E-CODE-1 \| research-packet \| fact:code \| The fixture code boundary is known\. \| refund:Context\.current-state \|/u);
  assert.match(content, /\| refund \| Constraints \| — \| 0 \|\s*\|\s*\| uncovered: technical,risk \| Decision \| user \/ open \|/u);
  const research = readClarifyResearchEvidence(root, changeId, requirementsRef, content);
  assert.equal(analyzeClarifyRequirements(content, research).questionSynthesis.ready, true);

  writeJson(inputRef, { ...input, sourceDigest: '0'.repeat(64) });
  assert.throws(() => persistClarifySynthesis(root, changeId, inputRef), /EH-CLARIFY-SYNTHESIS-170: sourceDigest must match/u);
  assert.throws(() => persistClarifySynthesis(root, changeId, '../escape.json'), /EH-CLARIFY-SYNTHESIS-170: input-ref must be/u);

  const help = spawnSync(process.execPath, [path.join(sourceRoot, 'runtime', 'cli.mjs'), 'clarify', '--help'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /clarify persist-synthesis <change-id> <input-ref>/u);
  console.log(`PASS clarify-synthesis-scaffold ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
