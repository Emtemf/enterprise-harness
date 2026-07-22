import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const packageScriptPath = path.join(repoRoot, 'bin', 'package.mjs');
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/package-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// 在临时目录里复制 repoRoot，避免污染真实 dist/
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'package-contract-smoke-'));
try {
  const repoCopy = path.join(tempRoot, 'repo');
  // 复制 repoRoot 到 repoCopy（排除 .git/.codegraph/node_modules）
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (['.git', '.codegraph', 'node_modules', 'dist'].includes(entry.name)) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDir(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    }
  }
  copyDir(repoRoot, repoCopy);

  // 运行 package.mjs
  const packageResult = spawnSync('node', [path.join(repoCopy, 'bin', 'package.mjs'), '--out', path.join(repoCopy, 'dist')], {
    cwd: repoCopy,
    encoding: 'utf-8',
  });

  // 检查 tarball 是否生成
  const distDir = path.join(repoCopy, 'dist');
  const distExists = fs.existsSync(distDir);
  let tarballPath = null;
  if (distExists) {
    const tars = fs.readdirSync(distDir).filter((f) => f.endsWith('.tar.gz'));
    if (tars.length > 0) tarballPath = path.join(distDir, tars[0]);
  }

  // 检查 tarball 内容
  let tarballValid = false;
  let containsGit = false;
  let containsNodeModules = false;
  let containsHarness = false;
  let containsClaude = false;

  if (tarballPath) {
    const listResult = spawnSync('tar', ['-tf', tarballPath], { encoding: 'utf-8' });
    const listing = listResult.stdout || '';
    tarballValid = listing.length > 0;
    containsGit = listing.includes('.git/');
    containsNodeModules = listing.includes('node_modules/');
    containsHarness = listing.includes('harness/');
    containsClaude = listing.includes('CLAUDE.md');
  }

  const ok =
    packageResult.status === 0 &&
    tarballPath !== null &&
    tarballValid &&
    !containsGit &&
    !containsNodeModules &&
    containsHarness &&
    containsClaude;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected package contract to fail before implementation');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    const failures = [];
    if (packageResult.status !== 0) failures.push(`package.mjs exited ${packageResult.status}: ${(packageResult.stderr || '').trim()}`);
    if (!tarballPath) failures.push('tarball not generated');
    if (tarballPath && !tarballValid) failures.push('tarball is empty or invalid');
    if (containsGit) failures.push('tarball contains .git/');
    if (containsNodeModules) failures.push('tarball contains node_modules/');
    if (!containsHarness) failures.push('tarball missing harness/');
    if (!containsClaude) failures.push('tarball missing CLAUDE.md');
    fail(`Expected package contract to pass:\n${failures.join('\n')}`);
  }

  pass(mode === 'green' ? 'Green package-contract smoke passed.' : 'Package-contract verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
