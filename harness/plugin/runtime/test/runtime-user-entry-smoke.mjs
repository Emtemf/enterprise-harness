import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  readme: path.join(repoRoot, 'README.md'),
  install: path.join(repoRoot, 'docs', 'zh-cn', 'installation-guide.md'),
  maintainer: path.join(repoRoot, 'docs', 'zh-cn', 'maintainer-runtime-guide.md'),
  overview: path.join(repoRoot, 'docs', 'zh-cn', 'overview.md'),
  command: path.join(repoRoot, '.claude-plugin', 'commands', 'harness.md'),
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/runtime-user-entry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const readme = read(files.readme);
const install = read(files.install);
const maintainer = read(files.maintainer);
const overview = read(files.overview);
const command = read(files.command);

const checks = [
  { ok: readme.includes('**用户唯一入口**：`/harness`'), why: 'README missing single user entry statement' },
  { ok: !readme.includes('### runtime CLI'), why: 'README still exposes runtime CLI as primary section' },
  { ok: install.includes('安装完成后，对普通用户来说只需要这样做：'), why: 'installation guide missing simple user flow' },
  { ok: install.includes('输入 `/harness`'), why: 'installation guide missing /harness user step' },
  { ok: !install.includes('首次 runtime 接入推荐顺序'), why: 'installation guide still contains maintainer runtime bootstrap flow' },
  { ok: maintainer.includes('这份文档只给 maintainer / operator / 排障者看'), why: 'maintainer guide missing maintainer-only notice' },
  { ok: overview.includes('唯一前门 `/harness`'), why: 'overview missing single-entry wording' },
  { ok: command.includes('唯一前门'), why: 'plugin harness command missing single-front-door wording' },
];

const failures = checks.filter((item) => !item.ok).map((item) => item.why);
const ok = failures.length === 0;

if (mode === 'red') {
  if (!ok) {
    fail(`Expected current user-entry contract to fail before implementation:\n${failures.join('\n')}`);
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail(`Expected user-entry contract smoke to pass:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green user-entry smoke passed.' : 'User-entry verify smoke passed.');
