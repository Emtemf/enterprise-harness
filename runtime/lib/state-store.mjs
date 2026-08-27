import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { assertSafeId, resolveChild } from './safe-paths.mjs';

function lockPathFor(file) {
  return `${file}.lock`;
}

export function withFileLock(file, action) {
  const lock = lockPathFor(file);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`EH-STATE-LOCK-012: concurrent update in progress for ${file}`);
    }
    throw error;
  }
  const cleanup = () => fs.rmSync(lock, { recursive: true, force: true });
  // Several CLI gates terminate with process.exit(2). Node does not unwind
  // JavaScript finally blocks in that case, so also remove the owned lock from
  // the synchronous exit event to preserve restartability.
  process.once('exit', cleanup);
  try {
    return action();
  } finally {
    process.removeListener('exit', cleanup);
    cleanup();
  }
}

export function changeTransactionTarget(root, changeId) {
  assertSafeId(changeId, 'changeId');
  const changeRoot = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  return path.join(changeRoot, '.change-transaction');
}

export function withChangeTransaction(root, changeId, action) {
  return withFileLock(changeTransactionTarget(root, changeId), action);
}

export function changeTransactionInProgress(root, changeId) {
  return fs.existsSync(`${changeTransactionTarget(root, changeId)}.lock`);
}

export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.renameSync(temporary, file);
    } catch (renameError) {
      // Windows: renameSync throws EPERM when the target already exists; unlink first then retry.
      if (renameError.code === 'EPERM' || renameError.code === 'EEXIST') {
        fs.unlinkSync(file);
        fs.renameSync(temporary, file);
      } else {
        throw renameError;
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function appendJsonLineOnce(file, event) {
  if (!event?.eventId) throw new Error('EH-EVENT-ID-013: append-only event requires eventId');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const duplicate = existing.split(/\r?\n/u).some((line) => {
    if (!line) return false;
    try {
      return JSON.parse(line).eventId === event.eventId;
    } catch {
      return false;
    }
  });
  if (!duplicate) fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf-8');
}

export function compareAndSwapJson(file, expectedRevision, nextValue, eventFile = null, event = null) {
  return withFileLock(file, () => {
    const current = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const currentRevision = Number.isInteger(current.revision) ? current.revision : 1;
    if (currentRevision !== expectedRevision) {
      throw new Error(
        `EH-STATE-REVISION-014: expected revision ${expectedRevision}, current revision ${currentRevision}`,
      );
    }
    if (eventFile && event) appendJsonLineOnce(eventFile, event);
    atomicWriteJson(file, nextValue);
    return nextValue;
  });
}
