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

export function writeHookSnapshot(root, toolUseId, snapshot) {
  if (!toolUseId) throw new Error('tool_use_id is required for Bash write attribution');
  const target = snapshotPath(root, toolUseId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
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
  }
}
