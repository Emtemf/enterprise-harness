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
const questionTemplate = JSON.parse(fs.readFileSync(
  path.join(root, 'skills/harness/assets/question-candidate.json.tmpl'),
  'utf-8',
));
const eventTemplate = JSON.parse(fs.readFileSync(
  path.join(root, 'skills/harness/assets/decision-event.json.tmpl'),
  'utf-8',
));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

for (const token of [
  'assets/research-brief.md.tmpl',
  'assets/question-candidate.json.tmpl',
  'assets/decision-event.json.tmpl',
  'assets/classification-input.json.tmpl',
  'assets/debt-assessment.json.tmpl',
  'assets/project-contract-assessment.json.tmpl',
  'references/output-contract.md',
  'references/clarify-few-shots.md',
  'clarify prepare-question',
  'clarify validate-debt',
  'clarify validate-project-contract',
  'clarify record-decision',
  'clarify seal-decisions',
  'clarify classify',
  'expired lease',
  'finalize-clarify-result.mjs',
]) assert.match(skill, new RegExp(escapeRegExp(token), 'u'), `Harness must reference ${token}`);

const canonicalQuestionPath = questionCandidatePath('change-id', questionTemplate.questionId);
assert.ok(
  skill.includes('harness/changes/<change-id>/evidence/clarify/questions/<question-id>.json'),
  `Skill question path must agree with runtime helper (${canonicalQuestionPath})`,
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

const dispatch = skill.indexOf('dispatch all required lanes');
const ask = skill.indexOf('AskUserQuestion', dispatch);
assert.ok(dispatch >= 0 && ask > dispatch,
  'Harness must dispatch all required lanes before AskUserQuestion');
assert.match(skill, /(?:一次只|exactly)\s*(?:生成|询问|调用)?\s*(?:one|一个)(?:\s*question|问题)/iu,
  'Harness must authorize exactly one question at a time');
assert.match(skill, /(?:不得|禁止|do not)\s*(?:创建、修改或)?(?:写入|修改|write)\s*`?CLAUDE\.md`?/iu,
  'Harness must forbid writing CLAUDE.md in this slice');
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

const factGateStart = skill.indexOf('2. 任一 required fact lane');
const factGateEnd = skill.indexOf('\n3. 任一 applicable decision surface', factGateStart);
assert.ok(factGateStart >= 0 && factGateEnd > factGateStart,
  'Harness must retain a bounded required-fact-lane branch');
const factGate = skill.slice(factGateStart, factGateEnd);
for (const field of [
  'Fact lanes',
  'Next research action/blocker',
  'Topology: not built',
  'Scores: not computed',
  'User question: none',
]) assert.match(factGate, new RegExp(escapeRegExp(field), 'u'),
  `Incomplete fact gate must emit ${field}`);
assert.match(factGate, /输出 `User question: none` 后立即结束本次响应/iu,
  'Incomplete fact gate must terminate immediately after its fixed gate block');
assert.match(factGate, /任何用户消息和任何工具调用都禁止/iu,
  'Incomplete fact gate must prohibit every user message and tool call');
assert.match(factGate, /raw request、repository 或 fact worker/iu,
  'Missing brief inputs must come from non-user fact sources');
assert.match(factGate, /user-only、topology 或 scope[^\n]*(?:不是例外|无例外)/iu,
  'Incomplete fact gate must close user-only, topology, and scope rationalizations');
assert.match(factGate, /(?:我现在能做什么|要推进请提供)[^\n]*(?:禁止|red flag)/iu,
  'Incomplete fact gate must identify the observed trailing-section rationalizations');
assert.match(factGate, /(?:我还能做什么|要推进需要你提供)[^\n]*(?:禁止|red flag)/iu,
  'Incomplete fact gate must close equivalent trailing-section wording');
assert.match(factGate, /changeId、project path、SDK、version、entrypoint 或 stack[^\n]*不得向用户请求/iu,
  'Incomplete fact gate must prohibit requesting every observed brief-input placeholder');

console.log(`PASS clarify-skill-contract ${mode}`);
