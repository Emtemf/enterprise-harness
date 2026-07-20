import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const files = {
  readme: path.join(repoRoot, 'README.md'),
  install: path.join(repoRoot, 'docs', 'zh-cn', 'installation-guide.md'),
  overview: path.join(repoRoot, 'docs', 'zh-cn', 'overview.md'),
  agents: path.join(repoRoot, 'AGENTS.md'),
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
  console.error('Usage: node harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const readme = read(files.readme);
const install = read(files.install);
const overview = read(files.overview);
const agents = read(files.agents);

const checks = [
  { ok: readme.includes('/plugin marketplace add') && (readme.includes('/absolute/path/to/enterprise-harness') || readme.includes('https://github.com/Emtemf/enterprise-harness')), why: 'README missing marketplace add path' },
  { ok: readme.includes('/plugin install enterprise-harness@enterprise-harness'), why: 'README missing plugin install path' },
  { ok: readme.includes('claude plugin marketplace update enterprise-harness'), why: 'README missing marketplace update path' },
  { ok: readme.includes('claude plugin update enterprise-harness@enterprise-harness --scope local'), why: 'README missing plugin update path' },
  { ok: readme.includes('node bin/enterprise-harness.mjs <command>'), why: 'README missing bin fallback' },
  { ok: install.includes('claude plugin marketplace add'), why: 'installation guide missing marketplace add path' },
  { ok: install.includes('claude plugin install enterprise-harness@enterprise-harness --scope local'), why: 'installation guide missing plugin install path' },
  { ok: install.includes('claude plugin marketplace update enterprise-harness'), why: 'installation guide missing marketplace update path' },
  { ok: install.includes('claude plugin update enterprise-harness@enterprise-harness --scope local'), why: 'installation guide missing plugin update path' },
  { ok: overview.includes('已具备 Claude Code 本地 marketplace 可安装/可更新路径的 repo contract + portable runtime MVP'), why: 'overview missing plugin-first positioning' },
  { ok: agents.includes('claude plugin marketplace add'), why: 'AGENTS missing plugin marketplace entry' },
  { ok: agents.includes('claude plugin install enterprise-harness@enterprise-harness --scope local'), why: 'AGENTS missing plugin install entry' },
];

const failures = checks.filter((item) => !item.ok).map((item) => item.why);
const ok = failures.length === 0;

if (mode === 'red') {
  if (!ok) {
    fail(`Expected current plugin docs contract to fail before implementation:\n${failures.join('\n')}`);
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail(`Expected plugin docs contract smoke to pass:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green plugin docs smoke passed.' : 'Plugin docs verify smoke passed.');
