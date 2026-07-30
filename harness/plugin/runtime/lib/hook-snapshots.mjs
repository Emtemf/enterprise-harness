import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runGit } from './git-evidence.mjs';
import { gitCommonDir } from './agent-evidence.mjs';

function records(buffer) {
  return Buffer.from(buffer || '').toString('utf-8').split('\0').filter(Boolean);
}

function snapshotKey(toolUseId) {
  return crypto.createHash('sha256').update(String(toolUseId || '')).digest('hex');
}

function snapshotPath(root, toolUseId) {
  return path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'hook-snapshots',
    `${snapshotKey(toolUseId)}.json`,
  );
}

function consumedMarkerPath(root, toolUseId) {
  return path.join(
    gitCommonDir(root),
    'enterprise-harness',
    'hook-snapshots',
    `${snapshotKey(toolUseId)}.consumed`,
  );
}

function fileState(absolute) {
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat) return { kind: 'missing' };
  if (stat.isSymbolicLink()) return { kind: 'symlink', target: fs.readlinkSync(absolute) };
  if (!stat.isFile()) return { kind: 'other' };
  return {
    kind: 'file',
    size: stat.size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
  };
}

export function captureGovernedSnapshot(root) {
  const pathArgs = ['--', 'src/main/java', 'src/test/java', 'openapi'];
  const tracked = records(runGit(['ls-files', '-z', ...pathArgs], root));
  const untracked = records(runGit([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    ...pathArgs,
  ], root));
  const index = new Map();
  for (const record of records(runGit(['ls-files', '-s', '-z', ...pathArgs], root))) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [mode, object, stage] = record.slice(0, tab).split(' ');
    index.set(record.slice(tab + 1), { mode, object, stage });
  }
  return Object.fromEntries([...new Set([...tracked, ...untracked])].sort().map((relative) => [
    relative,
    {
      worktree: fileState(path.join(root, relative)),
      index: index.get(relative) || null,
    },
  ]));
}

export function diffGovernedSnapshots(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((relative) => JSON.stringify(before[relative] ?? null) !== JSON.stringify(after[relative] ?? null))
    .sort();
}

const SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;

function pruneStaleSnapshots(dir) {
  const cutoff = Date.now() - SNAPSHOT_RETENTION_MS;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith('.json') && !name.endsWith('.consumed')) continue;
    const absolute = path.join(dir, name);
    const stat = fs.statSync(absolute, { throwIfNoEntry: false });
    if (stat && stat.mtimeMs < cutoff) fs.rmSync(absolute, { force: true });
  }
}

export function writeHookSnapshot(root, toolUseId, snapshot) {
  if (!toolUseId) throw new Error('tool_use_id is required for Bash write attribution');
  const target = snapshotPath(root, toolUseId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  pruneStaleSnapshots(path.dirname(target));
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(snapshot)}\n`, 'utf-8');
  fs.renameSync(temporary, target);
  return target;
}

export function consumeHookSnapshot(root, toolUseId) {
  if (!toolUseId) return null;
  const target = snapshotPath(root, toolUseId);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
  } finally {
    fs.rmSync(target, { force: true });
    fs.writeFileSync(consumedMarkerPath(root, toolUseId), '', 'utf-8');
  }
}

// Claude Code runs a PostToolUse hook once per registration. A repo that is both a
// plugin and its own standalone checkout registers the same hook twice, so the second
// run finds the snapshot already consumed. That is duplicate delivery of an attributed
// write, not an unattributed one.
export function hookSnapshotAlreadyConsumed(root, toolUseId) {
  if (!toolUseId) return false;
  return fs.existsSync(consumedMarkerPath(root, toolUseId));
}
