import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const doctorHooksPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'doctor-hooks.mjs');
const auditLib = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'lib', 'hook-audit.mjs');
const mode = process.argv[2];

function fail(m) { console.error(m); process.exit(1); }
function pass(m) { console.log(m); process.exit(0); }

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/doctor-hooks-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const failures = [];
const { classifyStopStdout, extractEventCommands } = await import(auditLib);

// 1. classifyStopStdout：核心契约判定。
if (!classifyStopStdout('{}').ok) failures.push('"{}" should be valid stop stdout');
if (classifyStopStdout('').ok) failures.push('empty stdout should be invalid');
if (classifyStopStdout('not json').ok) failures.push('non-json should be invalid');
if (classifyStopStdout('{"continue":true,"suppressOutput":true}').ok) {
  failures.push('continue/suppressOutput fields must be flagged invalid (Stop schema rejects them)');
}
if (!classifyStopStdout('{"systemMessage":"hi"}').ok) failures.push('systemMessage should be valid');

// 2. extractEventCommands：从 settings 对象抽 Stop 命令。
const sample = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node x.mjs' }, { type: 'other' }] }] } };
const cmds = extractEventCommands(sample, 'Stop');
if (cmds.length !== 1 || cmds[0] !== 'node x.mjs') failures.push('extractEventCommands should return command hooks only');
if (extractEventCommands({}, 'Stop').length !== 0) failures.push('missing hooks should yield empty');

// 3. cli 注册 doctor-hooks。
if (!fs.readFileSync(cliPath, 'utf-8').includes("'doctor-hooks'")) failures.push('cli.mjs must register doctor-hooks');

// 4. doctor-hooks 实跑：应报告我们自己的 stop hook 为健康（valid），--json 可解析。
const res = spawnSync('node', [doctorHooksPath, '--json'], { cwd: repoRoot, encoding: 'utf-8' });
let parsed = null;
try { parsed = JSON.parse(res.stdout); } catch { /* leave null */ }
if (!parsed) {
  failures.push('doctor-hooks --json should emit parseable JSON');
} else {
  const ours = parsed.findings.filter((f) => f.source && f.source.includes('enterprise-harness') || f.kind === 'settings');
  if (ours.length === 0) failures.push('doctor-hooks should audit our own stop hooks');
  const ourBad = ours.filter((f) => !f.ok);
  if (ourBad.length > 0) failures.push('our own stop hooks must all be healthy (valid stdout): ' + JSON.stringify(ourBad.map((f) => f.detail)));
}

const ok = failures.length === 0;
if (mode === 'red') {
  if (!ok) fail(`Expected doctor-hooks contract to hold:\n${failures.join('\n')}`);
  pass('Red precondition no longer holds.');
}
if (!ok) fail(`Expected doctor-hooks contract to hold:\n${failures.join('\n')}`);
pass(mode === 'green' ? 'Green doctor-hooks-contract smoke passed.' : 'Doctor-hooks-contract verify smoke passed.');
