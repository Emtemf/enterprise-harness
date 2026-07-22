import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

// 解析参数
let targetPath = process.cwd();
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target' && args[i + 1]) {
    targetPath = path.resolve(args[i + 1]);
    i++;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Enterprise Harness Installer');
    console.log('Usage: node bin/install.mjs [--target <path>] [--dry-run]');
    console.log('  --target <path>  目标项目路径（默认当前目录）');
    console.log('  --dry-run        只显示将要复制的文件，不实际执行');
    process.exit(0);
  }
}

// 需要复制的文件/目录（相对于 repoRoot）
const filesToCopy = [
  'CLAUDE.md',
  'AGENTS.md',
  'PROGRESS.md',
];

const dirsToCopy = [
  '.claude/rules',
  '.claude/skills',
  '.claude/agents',
  '.claude/settings.json', // 特殊：智能合并
  'harness',
];

// 需要排除的目录（复制 harness 时）
const excludeDirs = new Set(['.git', '.codegraph', 'node_modules', 'dist', '__pycache__']);

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeDirs.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

// 智能合并 settings.json
function smartMergeSettings(srcSettingsPath, destSettingsPath) {
  if (!fs.existsSync(srcSettingsPath)) return;

  const srcSettings = JSON.parse(fs.readFileSync(srcSettingsPath, 'utf-8'));

  if (!fs.existsSync(destSettingsPath)) {
    // 用户没有 settings.json，直接复制
    fs.mkdirSync(path.dirname(destSettingsPath), { recursive: true });
    fs.writeFileSync(destSettingsPath, JSON.stringify(srcSettings, null, 2) + '\n', 'utf-8');
    return;
  }

  // 用户已有 settings.json，智能合并 hooks
  const destSettings = JSON.parse(fs.readFileSync(destSettingsPath, 'utf-8'));
  const merged = { ...destSettings };

  for (const [hookType, hookGroups] of Object.entries(srcSettings.hooks || {})) {
    if (!merged.hooks) merged.hooks = {};
    if (!merged.hooks[hookType]) {
      // 用户没有这个 hook type，直接添加
      merged.hooks[hookType] = hookGroups;
    } else {
      // 用户已有这个 hook type，合并（保留用户已有的，添加 harness 的）
      const existingCommands = new Set(
        merged.hooks[hookType].flatMap((g) => g.hooks || []).map((h) => h.command || '')
      );
      for (const group of hookGroups) {
        const newCommands = (group.hooks || []).map((h) => h.command || '');
        const hasNew = newCommands.some((cmd) => !existingCommands.has(cmd));
        if (hasNew) {
          merged.hooks[hookType].push(group);
        }
      }
    }
  }

  // 合并其他顶层字段（如 permissions、env），保留用户已有值
  for (const [key, value] of Object.entries(srcSettings)) {
    if (key === 'hooks') continue; // 已处理
    if (!(key in merged)) {
      merged[key] = value;
    }
  }

  fs.writeFileSync(destSettingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

console.log('Enterprise Harness Installer');
console.log(`Source: ${repoRoot}`);
console.log(`Target: ${targetPath}`);
if (dryRun) console.log('(dry-run mode: no files will be copied)');

if (!fs.existsSync(targetPath)) {
  console.error(`ERROR: target path does not exist: ${targetPath}`);
  process.exit(1);
}

// 1. 复制独立文件
for (const file of filesToCopy) {
  const src = path.join(repoRoot, file);
  const dest = path.join(targetPath, file);
  if (dryRun) {
    console.log(`  [dry-run] would copy: ${file}`);
  } else {
    if (copyFile(src, dest)) console.log(`  installed: ${file}`);
  }
}

// 2. 复制目录
for (const dir of dirsToCopy) {
  if (dir.endsWith('settings.json')) {
    // 特殊处理：智能合并
    const src = path.join(repoRoot, dir);
    const dest = path.join(targetPath, dir);
    if (dryRun) {
      console.log(`  [dry-run] would smart-merge: ${dir}`);
    } else {
      smartMergeSettings(src, dest);
      console.log(`  merged: ${dir}`);
    }
  } else {
    const src = path.join(repoRoot, dir);
    const dest = path.join(targetPath, dir);
    if (dryRun) {
      console.log(`  [dry-run] would copy dir: ${dir}/`);
    } else {
      copyDir(src, dest);
      console.log(`  installed: ${dir}/`);
    }
  }
}

console.log('Installation complete.');
console.log('');
console.log('Next steps:');
console.log('  1. Open Claude Code in your project');
console.log('  2. Run /harness to start the staged workflow');
