import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);

// 解析参数
let bumpType = 'patch'; // patch | minor | major
let dryRun = false;
let help = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--patch') bumpType = 'patch';
  else if (arg === '--minor') bumpType = 'minor';
  else if (arg === '--major') bumpType = 'major';
  else if (arg === '--dry-run') dryRun = true;
  else if (arg === '--help' || arg === '-h') help = true;
}

if (help) {
  console.log('Enterprise Harness Release');
  console.log('Usage: node bin/release.mjs [--patch|--minor|--major] [--dry-run]');
  console.log('  --patch   bump patch version (default)');
  console.log('  --minor   bump minor version');
  console.log('  --major   bump major version');
  console.log('  --dry-run 只显示将要执行的步骤，不实际执行');
  process.exit(0);
}

// 读取当前版本
const pkgPath = path.join(repoRoot, 'package.json');
const manifestPath = path.join(repoRoot, 'harness', 'plugin', 'manifest.json');
const pluginJsonPath = path.join(repoRoot, '.claude-plugin', 'plugin.json');
const marketplacePath = path.join(repoRoot, '.claude-plugin', 'marketplace.json');
const readmePath = path.join(repoRoot, 'README.md');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8'));
const currentVersion = pkg.version;

// 计算 bump 后的版本
function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  let [major, minor, patch] = parts;
  if (type === 'major') { major++; minor = 0; patch = 0; }
  else if (type === 'minor') { minor++; patch = 0; }
  else { patch++; }
  return `${major}.${minor}.${patch}`;
}

const newVersion = bumpVersion(currentVersion, bumpType);
const tagName = `v${newVersion}`;

console.log('Enterprise Harness Release');
console.log(`Current version: ${currentVersion}`);
console.log(`Bump type: ${bumpType}`);
console.log(`New version: ${newVersion}`);
console.log(`Tag: ${tagName}`);
console.log('');

const steps = [
  '1. 在任何版本写入、commit、tag 或 push 前运行 npm run prepublish-check',
  `2. 原子更新 package / runtime manifest / plugin / marketplace root+entry / README -> ${newVersion}`,
  `3. git add + commit: "chore: release ${newVersion}"`,
  `4. git tag ${tagName}`,
  `5. git push origin main --tags`,
  `6. GitHub Actions (release.yml) 自动构建 tarball并发布`,
];

console.log('Release steps:');
steps.forEach((s) => console.log(`  ${s}`));
console.log('');

if (dryRun) {
  console.log('[dry-run] No changes made. Re-run without --dry-run to execute.');
  process.exit(0);
}

// 实际执行
console.log('Executing release...');

// 所有可能产生副作用的动作之前，先执行完整发布验收。
const prepublish = spawnSync('npm', ['run', 'prepublish-check'], { cwd: repoRoot, encoding: 'utf-8', shell: false });
process.stdout.write(prepublish.stdout || '');
process.stderr.write(prepublish.stderr || '');
if (prepublish.status !== 0) {
  console.error('ERROR: prepublish acceptance failed; no release files were changed');
  process.exit(prepublish.status ?? 1);
}

// 1. 验收通过后，同步全部版本投影。
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
pluginJson.version = newVersion;
fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n', 'utf-8');
marketplace.version = newVersion;
for (const entry of marketplace.plugins || []) {
  if (entry.name === pluginJson.name) entry.version = newVersion;
}
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n', 'utf-8');
const readme = fs.readFileSync(readmePath, 'utf-8').replace(/^# Enterprise Harness \(v[^)]+\)/u, `# Enterprise Harness (v${newVersion})`);
fs.writeFileSync(readmePath, readme, 'utf-8');
console.log('  ✓ package / runtime manifest / plugin / marketplace / README versions updated');

// 2. git add + commit
const commitResult = spawnSync('git', ['add', '-A'], { cwd: repoRoot, encoding: 'utf-8' });
if (commitResult.status !== 0) {
  console.error('ERROR: git add failed');
  process.exit(1);
}

const commitMsgResult = spawnSync('git', ['commit', '-m', `chore: release ${newVersion}`], { cwd: repoRoot, encoding: 'utf-8' });
if (commitMsgResult.status !== 0) {
  console.error('ERROR: git commit failed');
  process.exit(1);
}
console.log(`  ✓ committed: "chore: release ${newVersion}"`);

// 4. git tag
const tagResult = spawnSync('git', ['tag', tagName], { cwd: repoRoot, encoding: 'utf-8' });
if (tagResult.status !== 0) {
  console.error(`ERROR: git tag ${tagName} failed`);
  process.exit(1);
}
console.log(`  ✓ tagged: ${tagName}`);

// 5. git push
console.log('  → pushing to origin...');
const pushResult = spawnSync('git', ['push', 'origin', 'main', '--tags'], { cwd: repoRoot, encoding: 'utf-8' });
if (pushResult.status !== 0) {
  console.error(`ERROR: git push failed: ${(pushResult.stderr || '').trim()}`);
  console.error('You may need to push manually: git push origin main --tags');
  process.exit(1);
}
console.log(`  ✓ pushed`);

console.log('');
console.log(`Release ${newVersion} triggered!`);
console.log('GitHub Actions will build the tarball and create the GitHub Release automatically.');
console.log(`Monitor at: https://github.com/Emtemf/enterprise-harness/actions`);
