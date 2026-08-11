import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
// .mcp.json is referenced by plugin.json's mcpServers field. Without it an
// installed plugin has no codegraph MCP tools, so exploration silently falls
// back to raw grep instead of the symbol graph.
const ROOT_FILES = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', '.mcp.json'];
const ALLOWED_TREES = [
  '.claude-plugin',
  '.claude/skills',
  '.claude/agents',
  '.claude/rules',
  'hooks',
  'runtime',
  'harness/plugin',
  'harness/specs',
  'harness/schemas',
  'harness/templates',
  'harness/reviewers',
  'harness/upstream',
  'bin',
];
const ALLOWED_HARNESS_FILES = [
  'harness/behavior-checks.json',
  'harness/capabilities.json',
  'harness/config.yaml',
  'harness/project.json',
];
const EXCLUDED_PREFIXES = ['runtime/test/', 'runtime/.bootstrap-ran'];

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

function writeOctal(header, offset, length, value) {
  const encoded = Math.trunc(value).toString(8).padStart(length - 1, '0');
  if (encoded.length >= length) throw new Error(`tar numeric field overflow: ${value}`);
  header.write(encoded, offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
}

function splitTarPath(relative) {
  const portable = normalized(relative);
  if (Buffer.byteLength(portable) <= 100) return { name: portable, prefix: '' };
  for (let index = portable.lastIndexOf('/'); index > 0; index = portable.lastIndexOf('/', index - 1)) {
    const prefix = portable.slice(0, index);
    const name = portable.slice(index + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) {
      return { name, prefix };
    }
  }
  throw new Error(`release path exceeds ustar limits: ${relative}`);
}

function tarEntry(relative, content) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitTarPath(relative);
  header.write(name, 0, 100, 'utf-8');
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, content.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 32, 'ascii');
  header.write('root', 297, 32, 'ascii');
  if (prefix) header.write(prefix, 345, 155, 'utf-8');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

function deterministicTarGzip(entries) {
  const tar = Buffer.concat([
    ...entries.map(({ relative, content }) => tarEntry(relative, content)),
    Buffer.alloc(1024),
  ]);
  const gzip = gzipSync(tar, { level: 9 });
  gzip.fill(0, 4, 8);
  gzip[9] = 255;
  return gzip;
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
  fs.mkdirSync(outDir, { recursive: true });
  const archiveFiles = [...files, 'manifest-files.json'];
  const entries = archiveFiles.map((relative) => ({
    relative,
    content: fs.readFileSync(path.join(stageRoot, relative)),
  }));
  fs.writeFileSync(tarballPath, deterministicTarGzip(entries));
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
