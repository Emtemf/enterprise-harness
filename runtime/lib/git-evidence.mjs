import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: args.includes('-z') ? 'buffer' : 'utf-8',
    shell: false,
  });
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf-8')
      : result.stderr;
    throw new Error(`git ${args.join(' ')} failed: ${String(detail || '').trim()}`);
  }
  return result.stdout;
}

function nulRecords(buffer) {
  return buffer.toString('utf-8').split('\0').filter(Boolean);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value ?? '').digest('hex');
}

function inventoryDigest(entries) {
  const hash = crypto.createHash('sha256');
  hash.update('git-file-inventory-v1\0');
  for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update('\0');
    hash.update(String(entry.content.length));
    hash.update('\0');
    hash.update(entry.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function fileDigest(absolute) {
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) return null;
  return sha256(fs.readFileSync(absolute));
}

function statusEntriesFromRecords(records) {
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    entries.push({ path: record.slice(3), status });
    if (/[RC]/.test(status)) index += 1;
  }
  return entries;
}

function isPreExistingActiveChangeMetadataPath(relative) {
  return /^harness\/changes\/[^/]+\/(runs\/|reviews\/|snapshots\/|state\.json$|validation\.md$)/.test(relative);
}

export function worktreeStatusEntries(cwd) {
  return statusEntriesFromRecords(nulRecords(runGit(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    cwd,
  )));
}

export function captureWorktreeBaseline(cwd) {
  const entries = worktreeStatusEntries(cwd);
  const digests = Object.fromEntries(entries.map((entry) => [
    entry.path,
    fileDigest(path.join(cwd, entry.path)),
  ]));
  return {
    baselineVersion: 1,
    paths: entries,
    digests,
  };
}

export function changedWorktreePaths(cwd) {
  return [...new Set(worktreeStatusEntries(cwd).map((entry) => entry.path))].sort();
}

export function changedPathsSinceBaseline(cwd, baseline) {
  if (!baseline || baseline.baselineVersion !== 1 || !Array.isArray(baseline.paths)) {
    return changedWorktreePaths(cwd);
  }
  const baselineEntries = new Map(baseline.paths.map((entry) => [entry.path, entry]));
  const baselineDigests = baseline.digests && typeof baseline.digests === 'object'
    ? baseline.digests
    : {};
  return [...new Set(worktreeStatusEntries(cwd)
    .filter((entry) => {
      const before = baselineEntries.get(entry.path);
      if (!before) return true;
      if (isPreExistingActiveChangeMetadataPath(entry.path)) return false;
      const currentDigest = fileDigest(path.join(cwd, entry.path));
      return baselineDigests[entry.path] !== currentDigest || before.status !== entry.status;
    })
    .map((entry) => entry.path))].sort();
}

export function changedPathsBetween(cwd, fromRef, toRef = 'HEAD') {
  return nulRecords(runGit([
    'diff',
    '--name-only',
    '-z',
    fromRef,
    toRef,
    '--',
  ], cwd)).sort();
}

export function worktreeSnapshotDigest(cwd) {
  const tracked = nulRecords(runGit(['ls-files', '-z'], cwd));
  const untracked = nulRecords(runGit(
    ['ls-files', '--others', '--exclude-standard', '-z'],
    cwd,
  ));
  const entries = [];
  for (const relative of [...new Set([...tracked, ...untracked])]) {
    const absolute = path.join(cwd, relative);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
    entries.push({ path: relative, content: fs.readFileSync(absolute) });
  }
  return inventoryDigest(entries);
}

export function headSnapshotDigest(cwd, ref = 'HEAD') {
  const records = nulRecords(runGit(['ls-tree', '-r', '-z', '--full-tree', ref], cwd));
  const entries = records.map((record) => {
    const tab = record.indexOf('\t');
    const metadata = record.slice(0, tab).split(' ');
    const relative = record.slice(tab + 1);
    return {
      path: relative,
      content: runGit(['cat-file', 'blob', metadata[2]], cwd),
    };
  });
  return inventoryDigest(entries);
}
