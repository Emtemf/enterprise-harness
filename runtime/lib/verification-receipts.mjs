// Runtime-owned Verify receipt contract.  `validation.md` is a human-readable
// report; these immutable receipts are the machine-verifiable bridge from an
// accepted TC to the evidence it consumed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadHandoffV2 } from '../core/handoff-v2.mjs';
import { sha256Artifact } from './result-contract.mjs';
import { readTaskExecutionReceipt } from './task-execution-receipt.mjs';
import {
  assertNoSymlinkComponents,
  assertSafeId,
  assertSafeRunId,
  isSafeRelativePath,
  resolveChild,
  resolveWithin,
} from './safe-paths.mjs';
import { taskTestCaseBindingsFromMarkdown } from './plan-test-case-binding.mjs';

const DIGEST = /^[a-f0-9]{64}$/u;
const TC_ID = /^TC[1-9][0-9]*$/u;
const STATUS = new Set(['executed', 'skipped', 'unsupported']);
const PROVENANCE = new Set(['task-receipt', 'verify-evidence']);
const RECEIPT_FIELDS = new Set([
  'receiptVersion', 'type', 'changeId', 'verifyRunId', 'tcId', 'status', 'reason',
  'provenance', 'evidenceRef', 'evidenceDigest', 'inputDigests', 'validation', 'createdAt',
]);
const VALIDATION_FIELDS = new Set(['path', 'digest']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactDigestMap(left, right) {
  return JSON.stringify(Object.entries(left || {}).sort(([a], [b]) => a.localeCompare(b)))
    === JSON.stringify(Object.entries(right || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function rejectUnknown(value, label, fields, problems) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) problems.push(`${label} has unknown property ${key}`);
  }
}

function freshDigest(root, changeDir, ref, digest, label, problems) {
  if (!isSafeRelativePath(ref)) {
    problems.push(`${label} must be a safe relative artifact reference`);
    return false;
  }
  if (!DIGEST.test(String(digest || ''))) {
    problems.push(`${label} digest must be a sha256 digest`);
    return false;
  }
  let absolute;
  try {
    absolute = resolveWithin(root, ref, label);
    assertNoSymlinkComponents(changeDir, absolute, label);
    if (!fs.existsSync(absolute)) throw new Error('file is missing');
    if (sha256Artifact(root, ref) !== digest) {
      problems.push(`${label} digest is stale: ${ref}`);
      return false;
    }
  } catch (error) {
    problems.push(`${label} is unreadable: ${ref} (${error.message})`);
    return false;
  }
  return true;
}

function acceptedRows(root, changeId, problems) {
  const ref = `harness/changes/${changeId}/test-cases.md`;
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  let text;
  try {
    const target = resolveWithin(root, ref, 'test-cases.md');
    assertNoSymlinkComponents(changeDir, target, 'test-cases.md');
    text = fs.readFileSync(target, 'utf-8');
  } catch (error) {
    problems.push(`test-cases.md is unreadable: ${error.message}`);
    return [];
  }
  const lines = text.split(/\r?\n/u);
  const header = lines.findIndex((line) => /^\|\s*TCID\s*\|/u.test(line));
  if (header < 0) {
    problems.push('test-cases.md has no TCID table');
    return [];
  }
  const rows = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 10 && TC_ID.test(cells[0]) && cells[9] === 'accepted') {
      rows.push({ tcId: cells[0], level: cells[2], priority: cells[3] });
    }
  }
  if (rows.length === 0) problems.push('test-cases.md has no accepted TC IDs');
  if (new Set(rows.map(({ tcId }) => tcId)).size !== rows.length) problems.push('test-cases.md contains duplicate accepted TC IDs');
  return rows;
}

export function verificationEvidenceDirectoryRef(changeId, verifyRunId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(verifyRunId, 'verifyRunId');
  return `harness/changes/${changeId}/evidence/verify/${verifyRunId}`;
}

export function verificationReceiptRef(changeId, verifyRunId, tcId) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(verifyRunId, 'verifyRunId');
  if (!TC_ID.test(String(tcId || ''))) throw new Error('tcId must be a canonical TC identifier');
  return `harness/changes/${changeId}/evidence/verification/${verifyRunId}/${tcId}.json`;
}

export function parseValidationTestCaseCoverage(content) {
  const coverage = [];
  const problems = [];
  for (const line of String(content || '').split(/\r?\n/u)) {
    const match = line.match(/^-\s*(TC[1-9][0-9]*)\s*\|\s*(executed|skipped|unsupported)\s*\|\s*(\S+)(?:\s*\|\s*(.+))?\s*$/u);
    if (!match) continue;
    const [, tcId, status, evidenceRef, reason = null] = match;
    coverage.push({ tcId, status, evidenceRef, reason: reason?.trim() || null });
  }
  const duplicates = coverage.map(({ tcId }) => tcId).filter((tcId, index, ids) => ids.indexOf(tcId) !== index);
  if (duplicates.length > 0) problems.push(`validation has duplicate TC receipt entries: ${[...new Set(duplicates)].join(', ')}`);
  return { coverage, problems };
}

function canonicalVerifyHandoff(root, changeId, verifyRunId, problems) {
  let handoff;
  try {
    handoff = loadHandoffV2(root, changeId, verifyRunId);
  } catch (error) {
    problems.push(`verify handoff is unreadable: ${error.message}`);
    return null;
  }
  if (handoff.stage !== 'verify' || handoff.role !== 'execute' || handoff.behavior !== 'verify.collect'
      || handoff.agent?.type !== 'enterprise-harness:artifact-worker' || handoff.agent?.skill !== 'verify') {
    problems.push('verify receipt must bind a canonical verify.collect artifact-worker run');
  }
  return handoff;
}

function taskReceiptProvenance(root, changeId, tcId, evidenceRef, problems) {
  const match = evidenceRef.match(new RegExp(`^harness/changes/${changeId}/evidence/tasks/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\\.json$`, 'u'));
  if (!match) return false;
  const taskId = match[1];
  const loaded = readTaskExecutionReceipt(root, changeId, taskId, { requireTrusted: true, requireFreshInputs: true });
  if (!loaded.ok) {
    problems.push(...loaded.problems.map((problem) => `task receipt ${taskId}: ${problem}`));
    return true;
  }
  let tasksContent = '';
  try {
    tasksContent = fs.readFileSync(path.join(root, 'harness', 'changes', changeId, 'tasks.md'), 'utf-8');
  } catch (error) {
    problems.push(`tasks.md is unreadable: ${error.message}`);
    return true;
  }
  const task = taskTestCaseBindingsFromMarkdown(tasksContent).tasks.find((entry) => entry.taskId === taskId);
  if (!task?.testCases.includes(tcId)) {
    problems.push(`task receipt ${taskId} is not mapped to ${tcId}`);
  }
  return true;
}

function receiptProvenance(root, changeId, verifyRunId, tcId, status, evidenceRef, problems) {
  if (status !== 'executed') return evidenceRef === `harness/changes/${changeId}/validation.md`
    ? 'verify-evidence'
    : null;
  if (taskReceiptProvenance(root, changeId, tcId, evidenceRef, problems)) return 'task-receipt';
  const evidenceDir = verificationEvidenceDirectoryRef(changeId, verifyRunId);
  if (evidenceRef === evidenceDir || evidenceRef.startsWith(`${evidenceDir}/`)) return 'verify-evidence';
  problems.push(`executed ${tcId} evidence must be a canonical task receipt or current verify evidence directory`);
  return null;
}

function validateInputDigests(root, changeDir, inputDigests, problems) {
  if (!isObject(inputDigests) || Object.keys(inputDigests).length === 0) {
    problems.push('inputDigests must be a non-empty object');
    return;
  }
  for (const [ref, digest] of Object.entries(inputDigests)) {
    freshDigest(root, changeDir, ref, digest, `input ${ref}`, problems);
  }
}

export function validateVerificationReceipt(root, receipt, {
  expectedChangeId = null,
  expectedVerifyRunId = null,
  expectedTcId = null,
  expectedInputDigests = null,
  expectedValidation = null,
} = {}) {
  const problems = [];
  if (!isObject(receipt)) return ['verification receipt must be an object'];
  rejectUnknown(receipt, 'verification receipt', RECEIPT_FIELDS, problems);
  if (receipt.receiptVersion !== 1) problems.push('receiptVersion must be 1');
  if (receipt.type !== 'verification-receipt') problems.push('type must be verification-receipt');
  if (!TC_ID.test(String(receipt.tcId || ''))) problems.push('tcId must be a canonical TC identifier');
  try { assertSafeId(receipt.changeId, 'changeId'); } catch (error) { problems.push(error.message); }
  try { assertSafeRunId(receipt.verifyRunId, 'verifyRunId'); } catch (error) { problems.push(error.message); }
  if (expectedChangeId && receipt.changeId !== expectedChangeId) problems.push(`changeId must be ${expectedChangeId}`);
  if (expectedVerifyRunId && receipt.verifyRunId !== expectedVerifyRunId) problems.push(`verifyRunId must be ${expectedVerifyRunId}`);
  if (expectedTcId && receipt.tcId !== expectedTcId) problems.push(`tcId must be ${expectedTcId}`);
  if (!STATUS.has(receipt.status)) problems.push(`invalid status ${receipt.status || 'missing'}`);
  if (!PROVENANCE.has(receipt.provenance)) problems.push(`invalid provenance ${receipt.provenance || 'missing'}`);
  if (receipt.status === 'executed' && receipt.reason !== null) problems.push('executed receipt requires reason=null');
  if (receipt.status !== 'executed' && (typeof receipt.reason !== 'string' || !receipt.reason.trim())) {
    problems.push(`${receipt.status || 'receipt'} requires a non-empty reason`);
  }
  const changeId = expectedChangeId || receipt.changeId;
  const verifyRunId = expectedVerifyRunId || receipt.verifyRunId;
  let changeDir = null;
  try { changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId'); } catch (error) { problems.push(error.message); }
  if (changeDir) {
    const handoff = canonicalVerifyHandoff(root, changeId, verifyRunId, problems);
    validateInputDigests(root, changeDir, receipt.inputDigests, problems);
    if (handoff && !exactDigestMap(receipt.inputDigests, handoff.inputDigests)) {
      problems.push('inputDigests do not exactly match the verify handoff');
    }
    if (expectedInputDigests && !exactDigestMap(receipt.inputDigests, expectedInputDigests)) {
      problems.push('inputDigests do not exactly match the expected verify inputs');
    }
    const validationRef = `harness/changes/${changeId}/validation.md`;
    rejectUnknown(receipt.validation, 'validation', VALIDATION_FIELDS, problems);
    if (receipt.validation?.path !== validationRef) problems.push(`validation.path must be ${validationRef}`);
    freshDigest(root, changeDir, receipt.validation?.path, receipt.validation?.digest, 'validation artifact', problems);
    if (expectedValidation && (receipt.validation?.path !== expectedValidation.path || receipt.validation?.digest !== expectedValidation.digest)) {
      problems.push('validation artifact does not match the current validation digest');
    }
    freshDigest(root, changeDir, receipt.evidenceRef, receipt.evidenceDigest, 'receipt evidence', problems);
    const actualProvenance = receiptProvenance(root, changeId, verifyRunId, receipt.tcId, receipt.status, receipt.evidenceRef, problems);
    if (actualProvenance && receipt.provenance !== actualProvenance) {
      problems.push(`provenance must be ${actualProvenance}`);
    }
  }
  if (!Number.isFinite(Date.parse(receipt.createdAt))) problems.push('createdAt must be an ISO timestamp');
  return [...new Set(problems)];
}

function buildReceipt(root, {
  changeId, verifyRunId, tcId, status, evidenceRef, reason, inputDigests, validation,
}) {
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const problems = [];
  const evidenceDigest = (() => {
    try {
      const target = resolveWithin(root, evidenceRef, 'receipt evidence');
      assertNoSymlinkComponents(changeDir, target, 'receipt evidence');
      if (!fs.existsSync(target)) throw new Error('file is missing');
      return sha256Artifact(root, evidenceRef);
    } catch (error) {
      problems.push(`receipt evidence is unreadable: ${evidenceRef} (${error.message})`);
      return null;
    }
  })();
  const provenance = receiptProvenance(root, changeId, verifyRunId, tcId, status, evidenceRef, problems);
  const receipt = {
    receiptVersion: 1,
    type: 'verification-receipt',
    changeId,
    verifyRunId,
    tcId,
    status,
    reason: status === 'executed' ? null : reason,
    provenance,
    evidenceRef,
    evidenceDigest,
    inputDigests: { ...inputDigests },
    validation: { ...validation },
    createdAt: new Date().toISOString(),
  };
  problems.push(...validateVerificationReceipt(root, receipt, {
    expectedChangeId: changeId,
    expectedVerifyRunId: verifyRunId,
    expectedTcId: tcId,
    expectedInputDigests: inputDigests,
    expectedValidation: validation,
  }));
  return { receipt, problems: [...new Set(problems)] };
}

export function persistVerificationReceipts(root, {
  changeId,
  verifyRunId,
  coverage,
  inputDigests,
  validationRef = null,
}) {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(verifyRunId, 'verifyRunId');
  const problems = [];
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const handoff = canonicalVerifyHandoff(root, changeId, verifyRunId, problems);
  const canonicalValidationRef = validationRef || `harness/changes/${changeId}/validation.md`;
  let validationDigest = null;
  try {
    const target = resolveWithin(root, canonicalValidationRef, 'validation artifact');
    assertNoSymlinkComponents(changeDir, target, 'validation artifact');
    if (!fs.existsSync(target)) throw new Error('file is missing');
    validationDigest = sha256Artifact(root, canonicalValidationRef);
  } catch (error) {
    problems.push(`validation artifact is unreadable: ${error.message}`);
  }
  if (handoff && !exactDigestMap(inputDigests, handoff.inputDigests)) {
    problems.push('inputDigests do not exactly match the verify handoff');
  }
  validateInputDigests(root, changeDir, inputDigests, problems);
  const rows = acceptedRows(root, changeId, problems);
  const byTc = new Map();
  for (const entry of coverage || []) {
    if (!entry || !TC_ID.test(String(entry.tcId || ''))) {
      problems.push('coverage contains an invalid TC ID');
      continue;
    }
    if (byTc.has(entry.tcId)) problems.push(`coverage contains duplicate ${entry.tcId}`);
    byTc.set(entry.tcId, entry);
  }
  const accepted = new Set(rows.map(({ tcId }) => tcId));
  for (const row of rows) {
    const entry = byTc.get(row.tcId);
    if (!entry) {
      problems.push(`${row.tcId} is not consumed by validation`);
      continue;
    }
    if (!STATUS.has(entry.status)) problems.push(`${row.tcId} has invalid verification status`);
    if (entry.status === 'unsupported') problems.push(`${row.tcId} is unsupported and cannot pass`);
    if (row.level === 'E2E' && row.priority === 'critical' && entry.status !== 'executed') {
      problems.push(`critical E2E ${row.tcId} must be executed`);
    }
    if (entry.status !== 'executed' && !String(entry.reason || '').trim()) {
      problems.push(`${entry.status || 'verification'} ${row.tcId} requires a non-empty reason`);
    }
  }
  for (const tcId of byTc.keys()) if (!accepted.has(tcId)) problems.push(`${tcId} is not an accepted test case`);
  if (problems.length > 0) throw new Error(`EH-VERIFY-RECEIPT-001: ${[...new Set(problems)].join('; ')}`);

  const validation = { path: canonicalValidationRef, digest: validationDigest };
  const builtReceipts = [];
  for (const row of rows) {
    const entry = byTc.get(row.tcId);
    const built = buildReceipt(root, {
      changeId,
      verifyRunId,
      tcId: row.tcId,
      status: entry.status,
      evidenceRef: entry.evidenceRef,
      reason: entry.reason,
      inputDigests,
      validation,
    });
    if (built.problems.length > 0) problems.push(...built.problems);
    const ref = verificationReceiptRef(changeId, verifyRunId, row.tcId);
    builtReceipts.push({ ref, receipt: built.receipt });
  }
  if (problems.length > 0) throw new Error(`EH-VERIFY-RECEIPT-002: ${[...new Set(problems)].join('; ')}`);
  const persisted = [];
  for (const { ref, receipt } of builtReceipts) {
    const target = resolveWithin(root, ref, 'verification receipt');
    assertNoSymlinkComponents(changeDir, target, 'verification receipt');
    if (fs.existsSync(target)) throw new Error(`EH-VERIFY-RECEIPT-003: verification receipt already exists: ${ref}`);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
    persisted.push({ path: ref, digest: sha256Artifact(root, ref) });
  }
  return { receipts: persisted, validation };
}

export function validateVerificationReceiptsForStageResult(root, {
  changeId,
  verifyRunId,
  inputDigests,
  artifacts,
}) {
  const problems = [];
  const rows = acceptedRows(root, changeId, problems);
  const validationRef = `harness/changes/${changeId}/validation.md`;
  let validationDigest = null;
  try { validationDigest = sha256Artifact(root, validationRef); } catch (error) { problems.push(`validation.md is unreadable: ${error.message}`); }
  const prefix = `harness/changes/${changeId}/evidence/verification/${verifyRunId}/`;
  const receiptArtifacts = (artifacts || []).filter((artifact) => artifact?.path?.startsWith(prefix));
  const byTc = new Map();
  let changeDir = null;
  try {
    changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  } catch (error) {
    problems.push(error.message);
  }
  for (const artifact of receiptArtifacts) {
    const match = artifact.path.match(/\/(TC[1-9][0-9]*)\.json$/u);
    if (!match) {
      problems.push(`verification receipt artifact path is invalid: ${artifact.path}`);
      continue;
    }
    if (byTc.has(match[1])) problems.push(`duplicate verification receipt artifact for ${match[1]}`);
    let receipt = null;
    try {
      const target = resolveWithin(root, artifact.path, 'verification receipt');
      if (changeDir) assertNoSymlinkComponents(changeDir, target, 'verification receipt');
      receipt = JSON.parse(fs.readFileSync(target, 'utf-8'));
    } catch (error) {
      problems.push(`verification receipt is unreadable: ${artifact.path} (${error.message})`);
    }
    if (!receipt) continue;
    if (artifact.digest !== sha256Artifact(root, artifact.path)) problems.push(`verification receipt artifact digest is stale: ${artifact.path}`);
    const receiptProblems = validateVerificationReceipt(root, receipt, {
      expectedChangeId: changeId,
      expectedVerifyRunId: verifyRunId,
      expectedTcId: match[1],
      expectedInputDigests: inputDigests,
      expectedValidation: { path: validationRef, digest: validationDigest },
    });
    problems.push(...receiptProblems.map((problem) => `${match[1]} receipt: ${problem}`));
    byTc.set(match[1], receipt);
  }
  const accepted = new Map(rows.map((row) => [row.tcId, row]));
  for (const [tcId, row] of accepted) {
    const receipt = byTc.get(tcId);
    if (!receipt) {
      problems.push(`${tcId} has no canonical verification receipt`);
      continue;
    }
    if (receipt.status === 'unsupported') problems.push(`${tcId} is unsupported and cannot pass`);
    if (row.level === 'E2E' && row.priority === 'critical' && receipt.status !== 'executed') {
      problems.push(`critical E2E ${tcId} must be executed`);
    }
  }
  for (const tcId of byTc.keys()) if (!accepted.has(tcId)) problems.push(`${tcId} receipt is not an accepted test case`);
  return [...new Set(problems)];
}

export function verificationReceiptDigest(receipt) {
  return crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}
