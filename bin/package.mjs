import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

// 解析参数
let outDir = path.join(repoRoot, 'dist');
let help = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outDir = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    help = true;
  }
}

if (help) {
  console.log('Enterprise Harness Packager');
  console.log('Usage: node bin/package.mjs [--out <dir>]');
  console.log('  --out <dir>  输出目录（默认 dist/）');
  process.exit(0);
}

// 读取版本
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const version = pkg.version || '0.0.0';
const tarballName = `enterprise-harness-${version}.tar.gz`;

// 排除的目录/文件
const excludeDirs = new Set([
  '.git',
  '.codegraph',
  'node_modules',
  'dist',
  '__pycache__',
  '.DS_Store',
]);
const excludeFiles = new Set([
  '.env',
  '.env.local',
]);

// 用 git archive 打包（排除 .git 相关），再用 tar 进一步排除 node_modules/dist
// 但 git archive 只包含 git tracked 文件，可能漏掉未跟踪但必要的文件
// 所以改用自定义 tar：遍历目录，排除特定项

console.log('Enterprise Harness Packager');
console.log(`Repo: ${repoRoot}`);
console.log(`Version: ${version}`);
console.log(`Output: ${outDir}/${tarballName}`);

fs.mkdirSync(outDir, { recursive: true });

// 生成排除列表文件（给 tar 用）
const excludeListPath = path.join(outDir, '.exclude-list');
const excludePatterns = ['.git', '.codegraph', 'node_modules', 'dist', '__pycache__', '.DS_Store', '.env', '.env.local'];
fs.writeFileSync(excludeListPath, excludePatterns.join('\n') + '\n', 'utf-8');

// 使用 tar 打包
const tarballPath = path.join(outDir, tarballName);
const tarResult = spawnSync('tar', [
  '-czf',
  tarballPath,
  '-C', repoRoot,
  '--exclude=.git',
  '--exclude=.codegraph',
  '--exclude=node_modules',
  '--exclude=dist',
  '--exclude=__pycache__',
  '--exclude=.DS_Store',
  '--exclude=.env',
  '--exclude=.env.local',
  '.',
], { encoding: 'utf-8' });

// 清理临时文件
fs.unlinkSync(excludeListPath);

if (tarResult.status !== 0) {
  console.error(`ERROR: tar failed: ${(tarResult.stderr || '').trim()}`);
  process.exit(1);
}

const stats = fs.statSync(tarballPath);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`Tarball created: ${tarballName} (${sizeMB} MB)`);
console.log('Packaging complete.');
