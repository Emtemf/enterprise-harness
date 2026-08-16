import fs from 'node:fs';
import path from 'node:path';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_RUN_ID = /^run_[0-9a-f-]{36}$/u;

function platformPath(value) {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function isSafeId(value) {
  return typeof value === 'string'
    && SAFE_ID.test(value)
    && !value.includes('..')
    && !value.includes('/')
    && !value.includes('\\')
    && !value.includes('\0');
}

export function assertSafeId(value, label = 'id') {
  if (!isSafeId(value)) {
    throw new Error(`${label} must be a safe identifier`);
  }
  return value;
}

export function isSafeRunId(value) {
  return typeof value === 'string' && SAFE_RUN_ID.test(value);
}

export function assertSafeRunId(value, label = 'runId') {
  if (!isSafeRunId(value)) {
    throw new Error(`${label} must be a canonical run identifier`);
  }
  return value;
}

export function safeSlug(value, label = 'slug') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 128);
  if (!isSafeId(slug)) {
    throw new Error(`${label} cannot be converted to a safe slug`);
  }
  return slug;
}

export function canonicalPath(targetPath) {
  const resolved = path.resolve(targetPath);
  let cursor = resolved;
  const missing = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    missing.unshift(path.basename(cursor));
    cursor = parent;
  }
  const existing = fs.existsSync(cursor)
    ? (fs.realpathSync.native?.(cursor) ?? fs.realpathSync(cursor))
    : cursor;
  return platformPath(path.resolve(existing, ...missing));
}

export function pathIsWithin(targetPath, parentPath) {
  const target = canonicalPath(targetPath);
  const parent = canonicalPath(parentPath);
  const relative = path.relative(parent, target);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== '..'
      && !path.isAbsolute(relative));
}

export function assertNoSymlinkComponents(parentPath, targetPath, label = 'path') {
  const parent = path.resolve(parentPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its trusted parent`);
  }
  let cursor = parent;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic-link component: ${cursor}`);
    }
  }
  return target;
}

export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return false;
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value)) return false;
  const parts = value.split(/[\\/]/u);
  if (parts.some((part) => part === '..' || part === '')) return false;
  return true;
}

export function resolveWithin(parentPath, relativePath, label = 'path') {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`${label} must be a safe relative path`);
  }
  const target = path.resolve(parentPath, relativePath);
  if (!pathIsWithin(target, parentPath)) {
    throw new Error(`${label} escapes its parent directory`);
  }
  return target;
}

export function resolveChild(parentPath, childId, label = 'id') {
  assertSafeId(childId, label);
  return resolveWithin(parentPath, childId, label);
}
