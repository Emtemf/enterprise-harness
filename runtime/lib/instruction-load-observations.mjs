import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { activeChangeId, gitCommonDir } from './agent-evidence.mjs';
import { assertNoSymlinkComponents, isSafeRelativePath, pathIsWithin } from './safe-paths.mjs';
import { appendJsonLineOnce, withFileLock } from './state-store.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function instructionLoadLedgerPath(root) {
  return path.join(gitCommonDir(root), 'enterprise-harness', 'instructions-loaded', 'events.jsonl');
}

function normalizeLoadedPath(root, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const target = path.resolve(root, value);
  if (!pathIsWithin(target, root)) return null;
  const relative = path.relative(root, target).split(path.sep).join('/');
  if (!relative || !isSafeRelativePath(relative)) return null;
  assertNoSymlinkComponents(root, target, 'loaded instruction');
  return { target, relative };
}

export function instructionLoadEventIdentity(root, event) {
  const loaded = normalizeLoadedPath(root, event?.file_path);
  if (!event?.session_id || !loaded || !fs.existsSync(loaded.target)) return null;
  return digest(JSON.stringify([
    event.session_id,
    loaded.relative,
    event.memory_type || null,
    event.load_reason || null,
    event.trigger_file_path || null,
    event.parent_file_path || null,
    digest(fs.readFileSync(loaded.target)),
  ]));
}

function optionalRelativePath(root, value) {
  if (value === null || value === undefined || value === '') return null;
  return normalizeLoadedPath(root, value)?.relative || null;
}

export function recordInstructionLoad(root, event) {
  if (event?.hook_event_name !== 'InstructionsLoaded') return null;
  const loaded = normalizeLoadedPath(root, event.file_path);
  if (!loaded || !fs.existsSync(loaded.target) || !fs.statSync(loaded.target).isFile()) return null;
  const bytes = fs.readFileSync(loaded.target);
  const record = {
    observationVersion: 1,
    type: 'instruction-load-observation',
    eventId: `instruction_${digest(JSON.stringify([
      event.session_id || null,
      loaded.relative,
      event.memory_type || null,
      event.load_reason || null,
      event.trigger_file_path || null,
      event.parent_file_path || null,
      digest(bytes),
    ]))}`,
    changeId: activeChangeId(root, { sessionId: event.session_id || null }),
    sessionId: event.session_id || null,
    filePath: loaded.relative,
    fileDigest: digest(bytes),
    memoryType: event.memory_type || null,
    loadReason: event.load_reason || null,
    globs: Array.isArray(event.globs) ? event.globs.filter((item) => typeof item === 'string') : [],
    triggerFilePath: optionalRelativePath(root, event.trigger_file_path),
    parentFilePath: optionalRelativePath(root, event.parent_file_path),
    observedAt: new Date().toISOString(),
  };
  const ledger = instructionLoadLedgerPath(root);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  withFileLock(ledger, () => appendJsonLineOnce(ledger, record));
  return Object.freeze(record);
}

export function readInstructionLoads(root) {
  const ledger = instructionLoadLedgerPath(root);
  if (!fs.existsSync(ledger)) return [];
  return fs.readFileSync(ledger, 'utf-8').split(/\r?\n/u).filter(Boolean).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value?.type === 'instruction-load-observation' ? [value] : [];
    } catch { return []; }
  });
}

export function instructionLoadStatus(root, targetPath, expectedDigest = null) {
  const events = readInstructionLoads(root).filter((event) => event.filePath === targetPath);
  const matching = expectedDigest ? events.filter((event) => event.fileDigest === expectedDigest) : events;
  return Object.freeze({
    targetPath,
    expectedDigest,
    loadedCurrent: matching.length > 0,
    observations: matching,
  });
}
