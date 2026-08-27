import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gitCommonDir } from './agent-evidence.mjs';
import { assertSafeId, resolveChild } from './safe-paths.mjs';
import { atomicWriteJson, withFileLock } from './state-store.mjs';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function normalizePromptClause(value) {
  return String(value || '').normalize('NFKC').replace(/[。；;.!?！？]+$/gu, '')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

export function promptClauses(value) {
  return String(value || '').split(/[。；;.!?！？\n]+/u).map(normalizePromptClause).filter(Boolean);
}

function receiptRoot(root) {
  return path.join(gitCommonDir(root), 'enterprise-harness', 'prompt-receipts');
}

function latestReceiptPath(root, sessionId) {
  return resolveChild(path.join(receiptRoot(root), 'sessions'), assertSafeId(sessionId, 'sessionId'), 'sessionId');
}

function bindingPath(root, changeId) {
  return `${resolveChild(path.join(receiptRoot(root), 'bindings'), assertSafeId(changeId, 'changeId'), 'changeId')}.json`;
}

export function recordPromptReceipt(root, event) {
  const sessionId = assertSafeId(event?.session_id, 'sessionId');
  const prompt = typeof event?.prompt === 'string' ? event.prompt : '';
  if (!prompt.trim()) throw new Error('EH-PROMPT-RECEIPT-154: UserPromptSubmit prompt is required');
  const clauses = [...new Set(promptClauses(prompt).map(sha256))];
  const receipt = {
    version: 1,
    type: 'host-user-prompt-receipt',
    sessionId,
    promptDigest: sha256(prompt.normalize('NFKC')),
    clauseDigests: clauses,
    promptLength: prompt.length,
    capturedAt: new Date().toISOString(),
    source: 'UserPromptSubmit',
  };
  const target = latestReceiptPath(root, sessionId);
  withFileLock(target, () => atomicWriteJson(target, receipt));
  return receipt;
}

export function bindLatestPromptReceipt(root, changeId, sessionId) {
  assertSafeId(changeId, 'changeId');
  assertSafeId(sessionId, 'sessionId');
  const source = latestReceiptPath(root, sessionId);
  if (!fs.existsSync(source)) return null;
  const receipt = JSON.parse(fs.readFileSync(source, 'utf-8'));
  const binding = {
    version: 1,
    type: 'change-user-prompt-binding',
    changeId,
    sessionId,
    promptDigest: receipt.promptDigest,
    clauseDigests: receipt.clauseDigests,
    promptLength: receipt.promptLength,
    capturedAt: receipt.capturedAt,
    boundAt: new Date().toISOString(),
    source: receipt.source,
  };
  const target = bindingPath(root, changeId);
  return withFileLock(target, () => {
    if (fs.existsSync(target)) {
      const existing = JSON.parse(fs.readFileSync(target, 'utf-8'));
      if (existing.promptDigest !== binding.promptDigest || existing.sessionId !== binding.sessionId) {
        throw new Error(`EH-PROMPT-RECEIPT-155: ${changeId} already has a different host prompt binding`);
      }
      return existing;
    }
    atomicWriteJson(target, binding);
    return binding;
  });
}

export function readPromptBinding(root, changeId) {
  const target = bindingPath(root, changeId);
  if (!fs.existsSync(target)) return null;
  try {
    const binding = JSON.parse(fs.readFileSync(target, 'utf-8'));
    if (binding?.version !== 1 || binding.type !== 'change-user-prompt-binding'
      || binding.changeId !== changeId || binding.source !== 'UserPromptSubmit'
      || !Array.isArray(binding.clauseDigests) || binding.clauseDigests.some((item) => !/^[a-f0-9]{64}$/u.test(item))) {
      return null;
    }
    return binding;
  } catch {
    return null;
  }
}

export function promptBindingCovers(root, changeId, rawRequest) {
  const binding = readPromptBinding(root, changeId);
  const clauses = promptClauses(rawRequest);
  if (!binding || clauses.length === 0) return false;
  const allowed = new Set(binding.clauseDigests);
  return clauses.every((clause) => allowed.has(sha256(clause)));
}
