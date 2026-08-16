import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from './state-store.mjs';

function recoverWindowsReplacement(target) {
  if (process.platform !== 'win32') return;
  const backup = `${target}.recovery`;
  if (!fs.existsSync(backup)) return;
  if (fs.existsSync(target)) {
    fs.rmSync(backup, { force: true });
  } else {
    fs.renameSync(backup, target);
  }
}

export function recoverTaskReceiptSpool(target) {
  recoverWindowsReplacement(target);
}

function atomicWriteReceiptSpool(target, value) {
  if (process.platform !== 'win32') {
    atomicWriteJson(target, value);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  recoverWindowsReplacement(target);
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const backup = `${target}.recovery`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      if (!fs.existsSync(target) && fs.existsSync(backup)) {
        fs.renameSync(backup, target);
      }
      throw error;
    }
    fs.rmSync(backup, { force: true });
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}


export function writeExclusiveJson(target, value, { validateTarget = null } = {}) {
  if (validateTarget) validateTarget();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (validateTarget) validateTarget();
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'wx',
    });
    if (validateTarget) validateTarget();
    fs.linkSync(temporary, target);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`exclusive runtime artifact already exists: ${target}`);
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function restoreSpool(spoolPath, previousSpool) {
  if (previousSpool === null) {
    fs.rmSync(spoolPath, { force: true });
    return;
  }
  atomicWriteReceiptSpool(spoolPath, previousSpool);
}

export function publishTaskReceiptArtifacts({
  spoolPath,
  canonicalPath,
  spool,
  receipt,
  isFinal,
  validateFresh,
  validateTarget,
}) {
  if (typeof validateFresh !== 'function' || typeof validateTarget !== 'function') {
    throw new Error('task receipt publication requires freshness and path validators');
  }
  recoverWindowsReplacement(spoolPath);
  const previousSpool = fs.existsSync(spoolPath)
    ? JSON.parse(fs.readFileSync(spoolPath, 'utf-8'))
    : null;
  let spoolWriteAttempted = false;
  let canonicalPublished = false;

  validateFresh();
  validateTarget(spoolPath);
  if (isFinal) validateTarget(canonicalPath);
  try {
    spoolWriteAttempted = true;
    atomicWriteReceiptSpool(spoolPath, spool);
    validateFresh();
    validateTarget(spoolPath);
    if (isFinal) {
      writeExclusiveJson(canonicalPath, receipt, {
        validateTarget: () => {
          validateFresh();
          validateTarget(canonicalPath);
        },
      });
      canonicalPublished = true;
      validateFresh();
      validateTarget(canonicalPath);
    }
  } catch (error) {
    const rollbackProblems = [];
    if (canonicalPublished) {
      try {
        validateTarget(canonicalPath);
        fs.rmSync(canonicalPath, { force: true });
      } catch (rollbackError) {
        rollbackProblems.push(rollbackError.message);
      }
    }
    if (spoolWriteAttempted) {
      try {
        validateTarget(spoolPath);
        restoreSpool(spoolPath, previousSpool);
      } catch (rollbackError) {
        rollbackProblems.push(rollbackError.message);
      }
    }
    if (rollbackProblems.length > 0) {
      throw new Error(`${error.message}; receipt publication rollback failed: ${rollbackProblems.join('; ')}`);
    }
    throw error;
  }
}
