import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const ROOT_FILES = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE'];
const ALLOWED_TREES = [
  '.claude-plugin',
  '.claude/skills',
  '.claude/agents',
  '.claude/rules',
  'hooks',
  'harness/plugin',
  'harness/specs',
  'harness/schemas',
  'harness/templates',
  'harness/reviewers',
  'harness/upstream',
  'bin',
];
const ALLOWED_HARNESS_FILES = ['harness/behavior-checks.json', 'harness/capabilities.json', 'harness/config.yaml'];
const EXCLUDED_PREFIXES = ['harness/plugin/runtime/test/'];
const REPRODUCIBLE_TIMESTAMP = new Date(0);

let outDir = path.join(repoRoot, 'dist');
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--out' && args[index + 1]) outDir = path.resolve(args[++index]);
  else if (args[index] === '--help' || args[index] === '-h') {
    console.log('Enterprise Harness Packager');
    console.log('Usage: node bin/package.mjs [--out <dir>]');
    console.log('Builds an allowlisted release artifact plus manifest-files.json and SHA256SUMS.');
    process.exit(0);
  } else {
    console.error(`Unknown option: ${args[index]}`);
    process.exit(1);
  }
}

function normalized(value) {
  return value.split(path.sep).join('/');
}

function walk(relativeRoot) {
  const absolute = path.join(repoRoot, relativeRoot);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`release asset must not be a symlink: ${relativeRoot}`);
  if (stat.isFile()) return [normalized(relativeRoot)];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(relativeRoot, entry.name);
    const portable = normalized(relative);
    if (EXCLUDED_PREFIXES.some((prefix) => portable.startsWith(prefix))) continue;
    if (entry.isSymbolicLink()) throw new Error(`release asset must not be a symlink: ${portable}`);
    if (entry.isDirectory()) files.push(...walk(relative));
    else if (entry.isFile()) files.push(portable);
  }
  return files;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const version = pkg.version || '0.0.0';
const tarballName = `enterprise-harness-${version}.tar.gz`;
const tarballPath = path.join(outDir, tarballName);
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-package-'));

try {
  const files = [...new Set([
    ...ROOT_FILES,
    ...ALLOWED_HARNESS_FILES,
    ...ALLOWED_TREES.flatMap(walk),
  ])].filter((relative) => fs.existsSync(path.join(repoRoot, relative))).sort();

  for (const relative of files) {
    const source = path.join(repoRoot, relative);
    const target = path.join(stageRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.utimesSync(target, REPRODUCIBLE_TIMESTAMP, REPRODUCIBLE_TIMESTAMP);
  }

  const manifest = {
    schemaVersion: 1,
    package: pkg.name,
    version,
    files: files.map((relative) => {
      const content = fs.readFileSync(path.join(stageRoot, relative));
      return { path: relative, size: content.length, sha256: sha256(content) };
    }),
  };
  fs.writeFileSync(
    path.join(stageRoot, 'manifest-files.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf-8',
  );
  fs.utimesSync(
    path.join(stageRoot, 'manifest-files.json'),
    REPRODUCIBLE_TIMESTAMP,
    REPRODUCIBLE_TIMESTAMP,
  );

  fs.mkdirSync(outDir, { recursive: true });
  const archiveFiles = [...files, 'manifest-files.json'];
  const tar = spawnSync('tar', ['-czf', tarballPath, '-C', stageRoot, ...archiveFiles], {
    encoding: 'utf-8',
    shell: false,
  });
  if (tar.status !== 0) throw new Error(`tar failed: ${(tar.stderr || '').trim()}`);
  const tarDigest = sha256(fs.readFileSync(tarballPath));
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${tarDigest}  ${tarballName}\n`, 'utf-8');
  fs.copyFileSync(path.join(stageRoot, 'manifest-files.json'), path.join(outDir, 'manifest-files.json'));

  console.log('Enterprise Harness Packager');
  console.log(`Tarball: ${tarballPath}`);
  console.log(`Files: ${manifest.files.length + 1}`);
  console.log(`SHA256: ${tarDigest}`);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}
