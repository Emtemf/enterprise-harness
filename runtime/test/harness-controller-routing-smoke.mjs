import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

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
assert.match(skill, /factGateOpen.*references\/clarify-research\.md/isu);
assert.match(skill, /factGateOpen=false.*references\/clarify-decisions\.md/isu);
assert.match(skill, /completion gate.*references\/clarify-completion\.md/isu);
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
