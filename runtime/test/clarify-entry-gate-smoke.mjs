import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = fs.readFileSync(path.join(root, 'skills/harness/SKILL.md'), 'utf-8');
const entryStart = skill.indexOf('## Turn entry：Fact gate');
const flowStart = skill.indexOf('Clarify 开始时读取');
assert.ok(entryStart >= 0 && flowStart > entryStart,
  'Fact gate turn-entry contract must precede every Clarify flow instruction');
assert.equal(skill.indexOf('AskUserQuestion') > entryStart, true,
  'Fact gate turn-entry contract must precede every AskUserQuestion instruction');

const entry = skill.slice(entryStart, flowStart);
assert.match(entry, /factGateOpen iff 任一 required lane 为 pending、missing、invalid 或 stale/u);
assert.match(entry, /只执行一个 agent-owned research\/recovery action[\s\S]*重算[\s\S]*回到本入口/u);
assert.match(entry, /Plan mode、tools disabled、packet in-flight/u);
assert.match(entry, /请求、选择、确认、普通问句、meta-choice/u);
assert.match(entry, /changeId、path、SDK、version、entrypoint、stack、status、偏离授权/u);
assert.match(entry, /Plan mode、tools unavailable、user-only、topology、scope、用户催促[\s\S]*都不是例外/u);
assert.match(entry,
  /纯文本恰好五行；无标题、前言、解释、表格、代码围栏、tool\/MCP 文本/u,
  'Terminal fallback must prohibit every wrapper observed in the live collection');
assert.match(entry, /第一字符是 `F`[\s\S]*最后字节是 `none`/u,
  'Terminal fallback must bind its exact first character and final bytes');
for (const line of [
  'Fact lanes:',
  'Next research action/blocker:',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
]) assert.match(entry, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
assert.ok(skill.trim().split(/\s+/u).length <= 1528,
  'Entry-gate stabilization must not grow the Harness Skill word count');

const shapeModuleUrl = pathToFileURL(path.join(
  root, 'test', 'skill-evals', 'harness', 'terminal-shape.mjs',
)).href;
const shapeModule = await import(shapeModuleUrl).catch(() => null);
assert.ok(shapeModule, 'Terminal fact-gate shape evaluator must exist');
const { evaluateTerminalFactGateShape } = shapeModule;
const valid = [
  'Fact lanes: code=pending, docs=pending',
  'Next research action/blocker: tools disabled in Plan mode',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
].join('\n');
assert.deepEqual(evaluateTerminalFactGateShape(valid), { pass: true, problems: [] });
for (const invalid of [
  `${valid}\n请提供 changeId`,
  valid.replace('User question: none', 'User question: choose a path'),
  valid.split('\n').slice(1).join('\n'),
  valid.replace('Next research action/blocker: tools disabled in Plan mode\n', ''),
  `\`\`\`\n${valid}\n\`\`\``,
  `Facts are blocked.\n\n\`\`\`\n${valid}\n\`\`\`\nClient.listTools() called but server does not advertise tools capability - returning empty list`,
]) assert.equal(evaluateTerminalFactGateShape(invalid).pass, false,
  `Shape evaluator must reject invalid terminal output:\n${invalid}`);

console.log(`PASS clarify-entry-gate ${mode}`);
