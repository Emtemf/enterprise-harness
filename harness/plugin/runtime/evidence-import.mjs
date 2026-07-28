import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  readAgentEvents,
  receiptSpoolPath,
} from './lib/agent-evidence.mjs';
import { evidenceModeForChange } from './lib/evidence-policy.mjs';
import {
  readAndValidateTddReceipt,
  receiptDigest,
  tddReceiptSpoolPath,
} from './lib/tdd-receipts.mjs';

function fail(message) {
  console.error(`BLOCK: ${message}`);
  process.exit(2);
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { flag: 'wx' });
  fs.renameSync(temporary, target);
}

function filesEqual(left, right) {
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  const a = crypto.createHash('sha256').update(fs.readFileSync(left)).digest('hex');
  const b = crypto.createHash('sha256').update(fs.readFileSync(right)).digest('hex');
  return a === b;
}

function patchId(cwd, commit) {
  const show = spawnSync('git', ['show', '--pretty=format:', '--binary', commit], {
    cwd,
    encoding: 'utf-8',
    shell: false,
  });
  if (show.status !== 0) return null;
  const id = spawnSync('git', ['patch-id', '--stable'], {
    cwd,
    encoding: 'utf-8',
    input: show.stdout,
    shell: false,
  });
  return id.status === 0 ? id.stdout.trim().split(/\s+/)[0] : null;
}

function integrationContainsImplementation(root, sourceRoot, sourceHead, integrationHead) {
  if (git(['merge-base', '--is-ancestor', sourceHead, integrationHead], root) !== null) return true;
  const sourcePatchId = patchId(sourceRoot, sourceHead);
  if (!sourcePatchId) return false;
  const history = git(['log', '--format=%H', '--max-count=64', integrationHead], root);
  return Boolean(history && history.split('\n').some((commit) => patchId(root, commit) === sourcePatchId));
}

const [changeId, taskId] = process.argv.slice(2);
if (!changeId || !taskId || changeId === '--help' || changeId === '-h') {
  console.log('Usage: node harness/plugin/runtime/evidence-import.mjs <change-id> <task-id>');
  process.exit(changeId ? 0 : 1);
}
const root = process.cwd();
const changeDir = path.join(root, 'harness', 'changes', changeId);
if (!fs.existsSync(changeDir)) fail(`change does not exist: ${changeId}`);
const mode = evidenceModeForChange(root, changeId);
if (!mode.ok) fail(`sealed evidence policy is unavailable: ${mode.problems.join('; ')}`);

const spoolPath = tddReceiptSpoolPath(root, changeId, taskId);
const loaded = readAndValidateTddReceipt(spoolPath, {
  root,
  changeId,
  taskId,
  allowBootstrap: taskId === 'task-1',
  requireComplete: true,
});
if (!loaded.ok) fail(`invalid TDD spool: ${loaded.problems.join('; ')}`);
const receipt = loaded.receipt;

if (receipt.provenance === 'runner-bootstrap') {
  const reviewPath = path.join(changeDir, 'reviews', 'code-reviewer-task1.json');
  if (!fs.existsSync(reviewPath)) fail('Task 1 bootstrap import requires independent code review');
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
  if (String(review.verdict || review.status || '').toLowerCase() !== 'pass') {
    fail('Task 1 bootstrap import requires reviewer verdict=pass');
  }
}

const expectedCommonDir = path.resolve(root, git(['rev-parse', '--git-common-dir'], root) || '.git');
if (path.resolve(receipt.worktree.gitCommonDir) !== expectedCommonDir) {
  fail('receipt git common dir does not belong to this integration checkout');
}
const integrationHead = git(['rev-parse', 'HEAD'], root);
const sourceHead = git(['rev-parse', 'HEAD'], receipt.worktree.path);
if (!integrationHead || !sourceHead
    || !integrationContainsImplementation(root, receipt.worktree.path, sourceHead, integrationHead)) {
  fail('executor implementation commit is not contained in integration HEAD');
}
for (const relative of receipt.changedPaths) {
  if (!filesEqual(
    path.join(receipt.worktree.path, relative),
    path.join(root, relative),
  )) {
    fail(`integrated content differs from reviewed executor worktree: ${relative}`);
  }
}

const imported = {
  ...receipt,
  import: {
    sourceSpoolDigest: receiptDigest(receipt),
    sourceWorktreeHead: sourceHead,
    integrationHead,
    importedAt: new Date().toISOString(),
  },
};
const durableTdd = path.join(changeDir, 'evidence', 'tdd', `${taskId}.json`);
atomicWrite(durableTdd, `${JSON.stringify(imported, null, 2)}\n`);

const agentSpool = receiptSpoolPath(root, changeId);
const agentEvents = readAgentEvents(root, changeId);
if (fs.existsSync(agentSpool) && agentEvents.length > 0) {
  const durableAgents = path.join(changeDir, 'evidence', 'runtime', 'agent-events.jsonl');
  atomicWrite(
    durableAgents,
    `${agentEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
  );
}
console.log(`Imported TDD evidence: ${durableTdd}`);
