import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { questionCandidatePath, validateQuestionCandidate } from '../core/clarify-question.mjs';
import { validateDecisionEvent } from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skill = fs.readFileSync(path.join(root, 'skills/harness/SKILL.md'), 'utf-8');
const phaseFiles = {
  research: 'skills/harness/references/clarify-research.md',
  decisions: 'skills/harness/references/clarify-decisions.md',
  completion: 'skills/harness/references/clarify-completion.md',
};
for (const relative of Object.values(phaseFiles)) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `Harness phase reference missing: ${relative}`);
}
const research = fs.readFileSync(path.join(root, phaseFiles.research), 'utf-8');
const decisions = fs.readFileSync(path.join(root, phaseFiles.decisions), 'utf-8');
const completion = fs.readFileSync(path.join(root, phaseFiles.completion), 'utf-8');
const pitfallsRef = 'skills/harness/references/downstream-pitfalls.md';
assert.equal(fs.existsSync(path.join(root, pitfallsRef)), true, 'Downstream pitfall reference must exist');
const questionTemplate = JSON.parse(fs.readFileSync(
  path.join(root, 'skills/harness/assets/question-candidate.json.tmpl'),
  'utf-8',
));
const eventTemplate = JSON.parse(fs.readFileSync(
  path.join(root, 'skills/harness/assets/decision-event.json.tmpl'),
  'utf-8',
));
const laneTemplate = JSON.parse(fs.readFileSync(
  path.join(root, 'skills/harness/assets/lane-applicability-input.json.tmpl'),
  'utf-8',
));
assert.equal(laneTemplate.type, 'lane-applicability-input');
assert.deepEqual(Object.keys(laneTemplate.lanes).sort(), ['code', 'docs']);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

for (const [body, tokens] of [
  [research, ['../assets/research-brief.md.tmpl', 'lane-applicability-input.json', 'clarify requirements-digest', 'clarify record-lanes', 'handoff create', 'handoff validate', 'expired lease']],
  [decisions, ['../assets/question-candidate.json.tmpl', 'clarify prepare-question']],
  [completion, [
    '../assets/decision-event.json.tmpl',
    '../assets/classification-input.json.tmpl',
    '../assets/debt-assessment.json.tmpl',
    '../assets/project-contract-assessment.json.tmpl',
    '../assets/project-contract-proposal.json.tmpl',
    'clarify validate-debt',
    'clarify validate-project-contract',
    'clarify record-decision',
    'clarify seal-decisions',
    'clarify classify',
    '../scripts/finalize-clarify-result.mjs',
  ]],
]) for (const token of tokens) assert.match(body, new RegExp(escapeRegExp(token), 'u'),
  `Phase authority must reference ${token}`);
for (const token of ['逐句完整引用当前 UserPromptSubmit', 'EH-LANE-CONTINUITY-158', '不得查找 prompt receipt 原文', '不得追加 `#E-*`']) {
  assert.match(research, new RegExp(escapeRegExp(token), 'u'), `Research contract must preserve ${token}`);
}
for (const token of ['uncertainties.length > 0', '无权把 packet 的非空 `uncertainties` 判成“低风险”', 'fact gate complete: false']) {
  assert.match(research, new RegExp(escapeRegExp(token), 'u'), `Research uncertainty gate must preserve ${token}`);
}
assert.match(research, /每个 lane 永远恰好一行.*更窄的新 run.*替换.*绝不追加第二条 code\/docs 行.*record-lanes/isu,
  'narrow research must replace the current lane projection instead of duplicating table rows');
for (const token of [
  'references/clarify-research.md',
  'references/clarify-decisions.md',
  'references/clarify-completion.md',
  'references/output-contract.md',
  'references/clarify-few-shots.md',
  'references/downstream-pitfalls.md',
]) assert.match(skill, new RegExp(escapeRegExp(token), 'u'), `Controller must route to ${token}`);

for (const relative of [
  'skills/harness/SKILL.md', 'skills/explore-code/SKILL.md', 'skills/research-docs/SKILL.md',
  'skills/design/SKILL.md', 'skills/plan/SKILL.md', 'skills/implement/SKILL.md',
  'skills/review/SKILL.md', 'skills/verify/SKILL.md', 'skills/archive/SKILL.md',
]) {
  const body = fs.readFileSync(path.join(root, relative), 'utf-8');
  const description = body.match(/^description:\s*>\n([\s\S]*?)\n(?:user-invocable|context|hooks|---):/mu)?.[1] || '';
  assert.match(description, /[\u3400-\u9fff]/u, `${relative} description must be Chinese`);
}
for (const relative of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'harness/plugin/manifest.json']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8'));
  assert.match(manifest.description, /[\u3400-\u9fff]/u, `${relative} description must be Chinese`);
  if (manifest.plugins) for (const plugin of manifest.plugins) {
    assert.match(plugin.description, /[\u3400-\u9fff]/u, `${relative} plugin description must be Chinese`);
  }
}
for (const option of questionTemplate.options) {
  assert.match(option.label, /[\u3400-\u9fff]/u, 'Question option labels must be Chinese');
  assert.match(option.description, /[\u3400-\u9fff]/u, 'Question option descriptions must be Chinese');
}

const canonicalQuestionPath = questionCandidatePath('change-id', questionTemplate.questionId);
assert.ok(
  decisions.includes('harness/changes/<change-id>/evidence/clarify/questions/<question-id>.json'),
  `Decision reference question path must agree with runtime helper (${canonicalQuestionPath})`,
);
assert.equal(questionTemplate.decisionType, 'scope-confirmation');
assert.equal(questionTemplate.targetRef, 'harness/changes/change-id/requirements.md');
assert.ok([...questionTemplate.header].length <= 12, 'AskUserQuestion header must be at most 12 characters');
assert.equal(
  questionTemplate.options.filter(({ label }) => /recommended/iu.test(label)).length,
  0,
  'candidate labels must not encode the host-visible recommendation marker',
);
assert.deepEqual(validateQuestionCandidate(questionTemplate), [], 'question template must pass runtime shape validation');
assert.deepEqual(validateDecisionEvent('change-id', eventTemplate), [], 'decision template must pass runtime shape validation');

assert.match(research, /全部 required lane[\s\S]*`Skill` tool calls before any `AskUserQuestion`/iu,
  'Research authority must dispatch all required forked Skills before AskUserQuestion');
assert.match(research, /不得直接调用 `Agent`\/`Task` 或手写 `subagent_type`/u,
  'Research authority must prohibit bypassing context-fork Skills');
assert.ok(skill.indexOf('references/clarify-research.md') < skill.indexOf('references/clarify-decisions.md'),
  'Controller must route research before decisions');
assert.match(decisions, /(?:一次只|exactly)\s*(?:生成|询问|调用)?\s*(?:one|一个)(?:\s*question|问题)/iu,
  'Harness must authorize exactly one question at a time');
for (const token of [
  'project-contract-proposal-approval',
  'clarify propose-project-contract',
  'clarify apply-project-contract',
  'clarify project-contract-status',
  'InstructionsLoaded',
  '不得直接写目标 instruction file',
]) assert.match(completion, new RegExp(escapeRegExp(token), 'u'),
  `Harness project-contract protocol must preserve ${token}`);
assert.match(completion, /一次性需求、当前 change 的偏好或临时选择只留在\s*requirements\/decision ledger/iu,
  'One-off preferences must not be promoted to project instructions');
const statusFirst = skill.indexOf('workflow status <change-id> --json');
const questionStatus = skill.indexOf('clarify status <change-id> --json', statusFirst);
const questionRecover = skill.indexOf('clarify recover <change-id>', questionStatus);
assert.ok(statusFirst >= 0 && questionStatus > statusFirst && questionRecover > questionStatus,
  'Harness recovery sequence must be workflow status, clarify status, then conditional clarify recover');
assert.match(skill, /(?:blocker|recovery|nextAction).*(?:停止|stop).*(?:一个|one)/isu,
  'Harness must stop and execute one workflow recovery before question recovery');
assert.doesNotMatch(skill, /changeId[^\n]{0,40}(?:后)?立即运行[^\n]*clarify recover/iu,
  'Harness must never recover a question immediately after learning changeId');
assert.doesNotMatch(skill, /workflow status[^\n]{0,80}(?:与|and|\+)[^\n]{0,40}clarify recover/iu,
  'Harness must never describe workflow status and clarify recover as an unconditional pair');
assert.doesNotMatch(skill, /(?:recover\/status|status\/recover)/iu,
  'Harness must not use an ambiguous shorthand that implies unconditional recovery');

const factGateStart = skill.indexOf('## Turn entry：Fact gate');
const factGateEnd = skill.indexOf('## Status-first controller', factGateStart);
assert.ok(factGateStart >= 0 && factGateEnd > factGateStart,
  'Harness must put a bounded required-fact-lane branch at turn entry');
const factGate = skill.slice(factGateStart, factGateEnd);
for (const field of [
  'Fact lanes',
  'Next research action/blocker',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
]) assert.match(factGate, new RegExp(escapeRegExp(field), 'u'),
  `Incomplete fact gate must emit ${field}`);
assert.match(factGate, /`User question: none`[\s\S]{0,80}最后字节是 `none`；随后立即结束本轮/iu,
  'Incomplete fact gate must terminate immediately after its fixed gate block');
assert.match(factGate,
  /factGateOpen[\s\S]{0,500}只执行一个 agent-owned research\/recovery action/iu,
  'Incomplete fact gate must keep the single research/recovery action executable');
assert.match(factGate, /重算全部 required lanes 并回到本入口/iu,
  'Incomplete fact gate must recompute lane state after its research/recovery action');
assert.match(factGate,
  /不能执行[\s\S]{0,240}纯文本恰好五行[\s\S]{0,300}`User question: none`[\s\S]{0,80}最后字节是 `none`/iu,
  'Only a selected terminal gate response must prohibit trailing text, user requests, and tool calls');
assert.doesNotMatch(factGate, /fact gate complete 前[^\n]*任何工具调用都禁止/iu,
  'Incomplete fact gate must not deadlock required research/recovery tool actions');
assert.match(factGate, /raw request、repository、fact worker/iu,
  'Missing brief inputs must come from non-user fact sources');
assert.match(factGate, /user-only、topology、scope[^\n]*(?:不是例外|无例外)/iu,
  'Incomplete fact gate must close user-only, topology, and scope rationalizations');
assert.match(factGate, /请求、选择、确认、普通问句、meta-choice/iu,
  'Incomplete fact gate must classify every conversational request as a user question');
assert.match(factGate, /changeId、path、SDK、version、entrypoint、stack、status、偏离授权/iu,
  'Incomplete fact gate must prohibit requesting every observed brief-input placeholder');

console.log(`PASS clarify-skill-contract ${mode}`);
