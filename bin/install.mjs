import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  createEvidencePolicy,
  evidencePolicySealPath,
  readEvidencePolicy,
} from '../harness/plugin/runtime/lib/evidence-policy.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const ROOT_DOCS = ['CLAUDE.md', 'AGENTS.md'];
const SOURCE_ROOTS = [
  '.claude/rules',
  '.claude/skills',
  '.claude/agents',
  'harness',
];
const EXCLUDED_PREFIXES = [
  'harness/changes/',
  'harness/archive/',
  'harness/work/',
  'harness/lessons/',
  'harness/plugin/runtime/test/',
];
const EXCLUDED_FILES = new Set([
  'harness/ACTIVE_CHANGE',
  'harness/command-policy.json',
  'harness/evidence-policy.json',
]);
const MANIFEST_RELATIVE = path.join('.enterprise-harness', 'install-manifest.json');

const options = {
  target: process.cwd(),
  dryRun: false,
  planJson: false,
  backupDir: null,
  force: false,
  rootDocs: true,
  uninstall: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--target' && args[index + 1]) options.target = path.resolve(args[++index]);
  else if (arg === '--dry-run') options.dryRun = true;
  else if (arg === '--plan-json') options.planJson = true;
  else if (arg === '--backup-dir' && args[index + 1]) options.backupDir = path.resolve(args[++index]);
  else if (arg === '--force') options.force = true;
  else if (arg === '--no-root-docs') options.rootDocs = false;
  else if (arg === '--uninstall') options.uninstall = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('Enterprise Harness Standalone Installer');
    console.log('Usage: node bin/install.mjs [options]');
    console.log('  --target <path>     target repository (default: cwd)');
    console.log('  --dry-run           inspect and plan without writing');
    console.log('  --plan-json         print the plan as JSON');
    console.log('  --backup-dir <path> store overwritten files in this directory');
    console.log('  --force             replace conflicting managed files');
    console.log('  --no-root-docs      do not add missing CLAUDE.md or AGENTS.md');
    console.log('  --uninstall         remove unchanged files installed by this installer');
    process.exit(0);
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileDigest(file) {
  return digest(fs.readFileSync(file));
}

function normalizeRelative(value) {
  return value.split(path.sep).join('/');
}

function excluded(relative) {
  const normalized = normalizeRelative(relative);
  return EXCLUDED_FILES.has(normalized)
    || EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function listFiles(relativeRoot) {
  const absoluteRoot = path.join(sourceRoot, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const stat = fs.lstatSync(absoluteRoot);
  if (stat.isSymbolicLink()) throw new Error(`source asset must not be a symlink: ${relativeRoot}`);
  if (stat.isFile()) return excluded(relativeRoot) ? [] : [normalizeRelative(relativeRoot)];
  const found = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name);
    if (excluded(relative)) continue;
    if (entry.isSymbolicLink()) throw new Error(`source asset must not be a symlink: ${relative}`);
    if (entry.isDirectory()) found.push(...listFiles(relative));
    else if (entry.isFile()) found.push(normalizeRelative(relative));
  }
  return found;
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function mergeSettings(source, target) {
  const merged = structuredClone(target || {});
  merged.hooks ||= {};
  for (const [event, groups] of Object.entries(source.hooks || {})) {
    merged.hooks[event] ||= [];
    const existing = new Set(
      merged.hooks[event].flatMap((group) => group.hooks || []).map((hook) => hook.command || ''),
    );
    for (const group of groups) {
      const additions = (group.hooks || []).filter((hook) => !existing.has(hook.command || ''));
      if (additions.length > 0) {
        merged.hooks[event].push({ ...group, hooks: additions });
        for (const hook of additions) existing.add(hook.command || '');
      }
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (key !== 'hooks' && !(key in merged)) merged[key] = value;
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
}

function previousManifest() {
  return readJson(path.join(options.target, MANIFEST_RELATIVE), { files: [] });
}

function ensureGitHead() {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: options.target,
    encoding: 'utf-8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error('EH-INSTALL-GIT-001 target repository must have a Git HEAD before installation');
  }
  return result.stdout.trim();
}

function buildPlan() {
  const previous = new Map(
    (previousManifest().files || []).map((entry) => [entry.path, entry.sha256]),
  );
  const assets = SOURCE_ROOTS.flatMap(listFiles);
  if (options.rootDocs) assets.push(...ROOT_DOCS.filter((file) => fs.existsSync(path.join(sourceRoot, file))));
  assets.push('.claude/settings.json');
  const unique = [...new Set(assets)].filter((file) => file !== '.claude/settings.json').sort();
  const plan = [];
  for (const relative of unique) {
    const source = path.join(sourceRoot, relative);
    const target = path.join(options.target, relative);
    const sourceSha = fileDigest(source);
    if (!fs.existsSync(target)) {
      plan.push({ path: relative, action: 'create', sourceSha });
      continue;
    }
    const targetSha = fileDigest(target);
    if (targetSha === sourceSha) {
      plan.push({ path: relative, action: 'unchanged', sourceSha });
    } else if (ROOT_DOCS.includes(relative)) {
      plan.push({ path: relative, action: 'preserve-user-file', sourceSha, targetSha });
    } else if (previous.get(relative) === targetSha || options.force) {
      plan.push({ path: relative, action: 'replace', sourceSha, targetSha });
    } else {
      plan.push({ path: relative, action: 'conflict', sourceSha, targetSha });
    }
  }

  const settingsRelative = '.claude/settings.json';
  const sourceSettings = readJson(path.join(sourceRoot, settingsRelative), {});
  const targetSettingsPath = path.join(options.target, settingsRelative);
  const mergedSettings = mergeSettings(sourceSettings, readJson(targetSettingsPath, {}));
  const mergedSha = digest(mergedSettings);
  const currentSha = fs.existsSync(targetSettingsPath) ? fileDigest(targetSettingsPath) : null;
  plan.push({
    path: settingsRelative,
    action: currentSha === mergedSha ? 'unchanged' : currentSha ? 'merge' : 'create',
    sourceSha: mergedSha,
    targetSha: currentSha,
    generatedContent: mergedSettings,
  });
  const policyRelative = 'harness/command-policy.json';
  const policyTarget = path.join(options.target, policyRelative);
  const mavenPolicy = `${JSON.stringify(readJson(
    path.join(sourceRoot, 'harness', 'templates', 'command-policy.maven.json'),
  ), null, 2)}\n`;
  if (!fs.existsSync(policyTarget)) {
    plan.push({
      path: policyRelative,
      action: 'create',
      sourceSha: digest(mavenPolicy),
      generatedContent: mavenPolicy,
    });
  } else {
    plan.push({
      path: policyRelative,
      action: 'preserve-user-config',
      sourceSha: digest(mavenPolicy),
      targetSha: fileDigest(policyTarget),
    });
  }
  return plan;
}

function removeEmptyParents(file) {
  let current = path.dirname(file);
  const boundary = path.resolve(options.target);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function uninstall() {
  const manifestPath = path.join(options.target, MANIFEST_RELATIVE);
  const manifest = readJson(manifestPath);
  if (!manifest) throw new Error('EH-INSTALL-MANIFEST-002 no standalone install manifest exists');
  const actions = [];
  for (const entry of manifest.files || []) {
    const target = path.join(options.target, entry.path);
    if (!fs.existsSync(target)) continue;
    if (entry.preserveOnUninstall) {
      actions.push({ path: entry.path, action: 'preserve-merged-config' });
      continue;
    }
    const unchanged = fileDigest(target) === entry.sha256;
    if (!unchanged && !options.force) {
      actions.push({ path: entry.path, action: 'preserve-modified' });
      continue;
    }
    actions.push({ path: entry.path, action: 'remove' });
    if (!options.dryRun) {
      fs.rmSync(target, { force: true });
      removeEmptyParents(target);
    }
  }
  if (!options.dryRun) fs.rmSync(manifestPath, { force: true });
  return actions;
}

function applyPlan(plan, head) {
  const conflicts = plan.filter((entry) => entry.action === 'conflict');
  if (conflicts.length > 0) {
    throw new Error(`EH-INSTALL-CONFLICT-003 conflicts: ${conflicts.map((entry) => entry.path).join(', ')}`);
  }
  const writable = plan.filter((entry) => ['create', 'replace', 'merge'].includes(entry.action));
  const stageRoot = fs.mkdtempSync(path.join(options.target, '.enterprise-harness-stage-'));
  const backupRoot = options.backupDir
    || path.join(options.target, '.enterprise-harness', 'backups', new Date().toISOString().replace(/[:.]/gu, '-'));
  const applied = [];
  const backups = [];
  const policyPath = path.join(options.target, 'harness', 'evidence-policy.json');
  const sealPath = evidencePolicySealPath(options.target);
  const policyExisted = fs.existsSync(policyPath);
  const sealExisted = fs.existsSync(sealPath);
  try {
    for (const entry of writable) {
      const staged = path.join(stageRoot, entry.path);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      if (entry.generatedContent !== undefined) fs.writeFileSync(staged, entry.generatedContent, 'utf-8');
      else fs.copyFileSync(path.join(sourceRoot, entry.path), staged);
    }
    for (const entry of writable) {
      const target = path.join(options.target, entry.path);
      if (fs.existsSync(target)) {
        const backup = path.join(backupRoot, entry.path);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(target, backup);
        backups.push({ target, backup });
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(path.join(stageRoot, entry.path), target);
      applied.push(target);
    }
    const loadedPolicy = readEvidencePolicy(options.target);
    if (!loadedPolicy.ok) {
      if (loadedPolicy.reason !== 'missing') {
        throw new Error(`EH-EVIDENCE-POLICY-004 ${loadedPolicy.problems.join('; ')}`);
      }
      createEvidencePolicy(options.target);
    }
    const installedFiles = plan
      .filter((entry) => !['preserve-user-file', 'conflict'].includes(entry.action))
      .map((entry) => ({
        path: entry.path,
        sha256: fileDigest(path.join(options.target, entry.path)),
        preserveOnUninstall: entry.path === '.claude/settings.json',
      }));
    const manifestPath = path.join(options.target, MANIFEST_RELATIVE);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      sourceVersion: readJson(path.join(sourceRoot, 'package.json')).version,
      targetHead: head,
      installedAt: new Date().toISOString(),
      files: installedFiles,
    }, null, 2)}\n`);
    fs.rmSync(stageRoot, { recursive: true, force: true });
    return { backupRoot, installedFiles };
  } catch (error) {
    for (const target of applied.reverse()) fs.rmSync(target, { force: true });
    for (const { target, backup } of backups.reverse()) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(backup, target);
    }
    if (!policyExisted) fs.rmSync(policyPath, { force: true });
    if (!sealExisted) fs.rmSync(sealPath, { force: true });
    fs.rmSync(stageRoot, { recursive: true, force: true });
    throw error;
  }
}

if (!fs.existsSync(options.target) || !fs.statSync(options.target).isDirectory()) {
  console.error(`EH-INSTALL-TARGET-005 target directory does not exist: ${options.target}`);
  process.exit(2);
}

try {
  if (options.uninstall) {
    const actions = uninstall();
    if (options.planJson) process.stdout.write(`${JSON.stringify({ mode: 'uninstall', actions }, null, 2)}\n`);
    else for (const item of actions) console.log(`${item.action}: ${item.path}`);
    process.exit(0);
  }

  const head = ensureGitHead();
  const plan = buildPlan();
  const summary = {
    target: options.target,
    targetHead: head,
    dryRun: options.dryRun,
    conflicts: plan.filter((entry) => entry.action === 'conflict').map((entry) => entry.path),
    actions: plan.map(({ generatedContent: _generatedContent, ...entry }) => entry),
  };
  if (options.planJson) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else {
    console.log('Enterprise Harness Standalone Installer');
    console.log(`Target: ${options.target}`);
    for (const item of summary.actions) console.log(`${item.action}: ${item.path}`);
  }
  if (summary.conflicts.length > 0) {
    console.error(`BLOCK [EH-INSTALL-CONFLICT-003] ${summary.conflicts.join(', ')}`);
    process.exit(2);
  }
  if (options.dryRun) process.exit(0);
  const result = applyPlan(plan, head);
  console.log(`Installation complete. Backup: ${result.backupRoot}`);
  console.log('Standalone entry: /harness');
} catch (error) {
  console.error(`BLOCK: ${error.message}`);
  process.exit(2);
}
