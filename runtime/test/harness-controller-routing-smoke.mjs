import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { CLARIFY_ITEMS, selectClarifyControllerRoute } from '../lib/clarify-readiness.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = path.join(root, 'skills', 'harness');
const read = (relative) => fs.readFileSync(path.join(skillDir, relative), 'utf-8');
const skill = read('SKILL.md');
const phaseReferences = [
  'references/clarify-research.md',
  'references/clarify-decisions.md',
  'references/clarify-completion.md',
];

const controllerWordCount = skill.trim().split(/\s+/u).length;
assert.ok(controllerWordCount >= 350 && controllerWordCount < 500,
  `Harness controller must stay in the 350-499 word budget; received ${controllerWordCount}`);
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] || '';
const frontmatterLines = frontmatter.split('\n');
const descriptionStart = frontmatterLines.findIndex((line) => /^description:\s*>\s*$/u.test(line));
const descriptionLines = [];
for (let index = descriptionStart + 1; index < frontmatterLines.length; index += 1) {
  if (!/^\s+/u.test(frontmatterLines[index])) break;
  descriptionLines.push(frontmatterLines[index].trim());
}
const description = descriptionLines.filter(Boolean).join(' ');
assert.match(description, /^Use when /u, 'description must expose only a trigger condition');
assert.doesNotMatch(description, /dispatch|route|gate|reference|workflow|question/iu,
  'description must not summarize the controller workflow');
assert.doesNotMatch(skill, /^## Phase [0-5]/gmu, 'Phase procedure detail belongs in on-demand references');
assert.doesNotMatch(
  skill,
  /\.schema\.json|questionVersion|handoff create|clarify prepare-question|clarify validate-debt|clarify validate-project-contract|clarify record-decision|clarify seal-decisions|clarify classify|finalize-clarify-result\.mjs/u,
  'Controller must not duplicate phase schemas or detailed commands',
);

const referenceBodies = new Map();
for (const relative of phaseReferences) {
  assert.equal(fs.existsSync(path.join(skillDir, relative)), true, `missing phase reference ${relative}`);
  assert.match(skill, new RegExp(`\\]\\(${relative.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\)`, 'u'),
    `controller must route to ${relative}`);
  const body = read(relative);
  const opening = body.split('\n').slice(0, 8).join('\n');
  assert.match(opening, /^Load when: .+$/mu, `${relative} needs an observable load condition at its opening`);
  assert.match(opening, /^Return to controller: .+$/mu, `${relative} needs an explicit return contract at its opening`);
  referenceBodies.set(relative, body);
}
const researchOpening = referenceBodies.get('references/clarify-research.md').split('\n').slice(0, 4).join('\n');
assert.match(researchOpening, /no active change.*lane applicability undecided.*active v6 Clarify.*factGateOpen=true.*pre-entry recovery never loads/isu);
assert.match(skill, /pre-entry recovery.*tools\/permission.*blocker.*不加载 phase reference/isu);
assert.match(researchOpening, /reload.*runtime.*readiness route/isu);
const completionOpening = referenceBodies.get('references/clarify-completion.md').split('\n').slice(0, 4).join('\n');
const completionBody = referenceBodies.get('references/clarify-completion.md');
assert.doesNotMatch(completionOpening, /user Decisions are resolved/iu);
assert.doesNotMatch(completionOpening, /transition action/iu);
assert.match(completionOpening, /factGateOpen=false.*topology.*Phase 2[–-]3.*frontier.*closed.*earliest invalid gate.*(?:debt|project-contract).*review/isu);
assert.doesNotMatch(completionOpening, /(?:gate|action).*(?:or proof|proof action)/iu,
  'persisted proof is transition-owned and must not reopen the completion route');
assert.match(completionBody, /clarifyTransitionReady.*(?:return|返回).*controller/isu);
assert.doesNotMatch(completionBody, /\]\((?:behavior-map|stage-decisions)\.md\)/u);
const readinessExpression = completionBody.match(/`clarifyTransitionReady = ([^`]+)`/u)?.[1];
assert.equal(typeof readinessExpression, 'string', 'completion must expose a mechanically testable readiness predicate');
assert.doesNotMatch(readinessExpression, /CompletionProof|proof/iu,
  'persisted CompletionProof must not be a Clarify transition-readiness prerequisite');
const readinessTerms = [
  'canonicalStageResultValid', 'independentReviewPassing', 'tecpcComplete', 'requiredArtifactsFresh',
];
for (const term of readinessTerms) assert.match(readinessExpression, new RegExp(`\\b${term}\\b`, 'u'));
const evaluateReadiness = (scope) => Function(
  ...Object.keys(scope), `"use strict"; return Boolean(${readinessExpression});`,
)(...Object.values(scope));
const completePrerequisites = Object.fromEntries(readinessTerms.map((term) => [term, true]));
assert.equal(evaluateReadiness(completePrerequisites), true,
  'fresh prerequisite evidence must be transition-ready without a persisted proof');
for (const missing of readinessTerms) {
  assert.equal(evaluateReadiness({ ...completePrerequisites, [missing]: false }), false,
    `missing ${missing} must remain on completion route C`);
}
const behaviorBody = read('references/behavior-map.md');
const behaviorOpening = behaviorBody.split('\n').slice(0, 4).join('\n');
assert.match(behaviorOpening, /active stage.*worker/isu);
const behaviorRows = behaviorBody.split('\n')
  .filter((line) => /^\|.+\|$/u.test(line) && !/^\|(?:---| 工作)/u.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', '')));
assert.deepEqual(
  behaviorRows.filter(([, skillName]) => skillName === 'archive'),
  [['归档', 'archive', 'enterprise-harness:artifact-worker', 'StageResult']],
  'the W-only behavior map must select the Archive skill and its capability agent',
);
const transitionBody = read('references/stage-decisions.md');
const transitionOpening = transitionBody.split('\n').slice(0, 4).join('\n');
assert.match(transitionOpening, /clarifyTransitionReady.*stageTransitionReady/isu);
const clarifyEvidenceRow = transitionBody.split('\n').find((line) => /^\| clarify \|/u.test(line));
assert.equal(typeof clarifyEvidenceRow, 'string', 'transition contract must define Clarify evidence');
assert.match(clarifyEvidenceRow, /persisted proof.*不是.*(?:输入)?前置/iu,
  'Clarify transition evidence must explicitly exclude persisted proof as a prerequisite');
assert.doesNotMatch(clarifyEvidenceRow, /CompletionProof 已持久化|generic CompletionProof.*(?:已持久化|fresh)/iu,
  'persisted proof must not be an input to the Clarify transition command');
assert.match(transitionBody, /(?:原子|atomically).*CompletionProof.*(?:重新读取|re-read).*canonical gate.*CAS/isu,
  'Clarify transition must create the proof, re-read the gate, then CAS the stage');
assert.match(skill, /路由是 runtime 派生值.*不在模型中重算布尔表达式/isu);
assert.match(skill, /clarifyReadiness\.route.*research\|decisions\|completion\|transition/isu);
assert.match(skill, /链接相对当前 SKILL\/reference 文件解析.*绝不相对项目 cwd/isu);
assert.match(skill, /report-only\/read-only.*snapshot.*所选 phase reference.*不得执行 action.*input refs、assets、supporting references/isu);
assert.match(skill, /命令必须逐字使用所选 reference.*exact argv.*不得合成 shorthand/isu);
assert.doesNotMatch(skill, /\b[RDCTWV]\s*=|stageClarify\s*=|postClarifyStage\s*=/u,
  'the model-facing controller must not recompute runtime route predicates');
assert.match(skill, /R.*references\/clarify-research\.md.*decisions.*references\/clarify-decisions\.md.*completion.*references\/clarify-completion\.md.*W.*references\/behavior-map\.md.*transition.*references\/stage-decisions\.md/isu);

const statusesAfter = (passed) => CLARIFY_ITEMS.map((id, index) => ({ id, status: index < passed ? 'pass' : 'blocked' }));
for (let passed = 0; passed <= CLARIFY_ITEMS.length; passed += 1) {
  const expected = passed < 3 ? 'research' : passed < 6 ? 'decisions' : passed < 14 ? 'completion' : 'transition';
  assert.equal(selectClarifyControllerRoute(statusesAfter(passed), passed === 14), expected,
    `${passed} passing ordered gates must select ${expected}`);
}
assert.equal(selectClarifyControllerRoute(statusesAfter(14), false), 'completion',
  'proof-free candidate failure must remain on completion');
assert.equal(selectClarifyControllerRoute(statusesAfter(6), true), 'completion',
  'transitionReady cannot bypass later Clarify gates');
assert.throws(() => selectClarifyControllerRoute(statusesAfter(13).slice(1), false), /EH-CLARIFY-ROUTE-148/u);
assert.throws(() => selectClarifyControllerRoute([
  ...statusesAfter(14).slice(0, -1), statusesAfter(14)[0],
], true), /EH-CLARIFY-ROUTE-148/u);
assert.throws(() => selectClarifyControllerRoute([
  ...statusesAfter(14).slice(0, -1), { id: CLARIFY_ITEMS.at(-1), status: 'unknown' },
], false), /EH-CLARIFY-ROUTE-148/u);
for (const retained of [
  'references/output-contract.md',
  'references/clarify-few-shots.md',
  'references/behavior-map.md',
  'references/stage-decisions.md',
]) assert.match(skill, new RegExp(retained.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
  `controller must retain ${retained}`);
for (const reference of fs.readdirSync(path.join(skillDir, 'references')).filter((name) => name.endsWith('.md'))) {
  const relative = `references/${reference}`;
  const body = read(relative);
  const opening = body.split('\n').slice(0, 8).join('\n');
  assert.match(opening, /^Load when: .+$/mu, `${relative} needs an observable load condition at its opening`);
  assert.match(opening, /^Return to controller: .+$/mu, `${relative} needs an explicit return contract at its opening`);
  referenceBodies.set(relative, body);
}

const authority = [
  ['dispatch all required lanes', 'references/clarify-research.md'],
  ['clarify prepare-question', 'references/clarify-decisions.md'],
  ['评分算法（必须从空集合开始）', 'references/clarify-decisions.md'],
  ['clarify validate-debt', 'references/clarify-completion.md'],
  ['clarify validate-project-contract', 'references/clarify-completion.md'],
  ['clarify seal-decisions', 'references/clarify-completion.md'],
  ['finalize-clarify-result.mjs', 'references/clarify-completion.md'],
];
const promptAuthorities = new Map([['SKILL.md', skill], ...referenceBodies]);
for (const [token, owner] of authority) {
  const owners = [...promptAuthorities].filter(([, body]) => body.includes(token)).map(([relative]) => relative);
  assert.deepEqual(owners, [owner], `${token} must have one prompt authority: ${owner}`);
}

function filesUnder(relative) {
  const absolute = path.join(skillDir, relative);
  return fs.readdirSync(absolute, { recursive: true, encoding: 'utf-8' })
    .filter((entry) => fs.statSync(path.join(absolute, entry)).isFile())
    .map((entry) => `${relative}/${String(entry).split(path.sep).join('/')}`);
}

function linksFrom(relative) {
  const content = read(relative);
  return [...content.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/gu)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/iu.test(target))
    .map((target) => path.relative(
      skillDir,
      path.resolve(skillDir, path.dirname(relative), target),
    ).split(path.sep).join('/'))
    .filter((target) => target && !target.startsWith('../'));
}

const reachable = new Set(['SKILL.md']);
const queue = ['SKILL.md'];
while (queue.length > 0) {
  const source = queue.shift();
  if (!source.endsWith('.md')) continue;
  for (const target of linksFrom(source)) {
    if (!fs.existsSync(path.join(skillDir, target)) || reachable.has(target)) continue;
    reachable.add(target);
    if (target.endsWith('.md')) queue.push(target);
  }
}
for (const supporting of ['references', 'assets', 'scripts'].flatMap(filesUnder)) {
  assert.equal(reachable.has(supporting), true, `supporting resource is unreachable from controller: ${supporting}`);
}

console.log(`PASS harness-controller-routing ${mode}`);
