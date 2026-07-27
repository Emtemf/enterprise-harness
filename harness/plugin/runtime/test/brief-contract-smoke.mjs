import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const specPath = path.join(repoRoot, 'harness', 'specs', 'brief-contract.md');
const explorationTemplatePath = path.join(repoRoot, 'harness', 'templates', 'exploration-brief.md');
const taskTemplatePath = path.join(repoRoot, 'harness', 'templates', 'task-brief.md');
const intakeSkillPath = path.join(repoRoot, '.claude', 'skills', 'harness-intake', 'SKILL.md');
const codeExplorePath = path.join(repoRoot, '.claude', 'agents', 'code-explore.md');

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/brief-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const spec = readText(specPath);
const explorationTemplate = readText(explorationTemplatePath);
const taskTemplate = readText(taskTemplatePath);
const intake = readText(intakeSkillPath);
const codeExplore = readText(codeExplorePath);
const ok = spec.includes('Exploration Brief')
  && spec.includes('Task Brief')
  && explorationTemplate.includes('# Exploration Brief')
  && explorationTemplate.includes('## Question')
  && taskTemplate.includes('# Task Brief')
  && taskTemplate.includes('## Task ID')
  && intake.includes('先按 `harness/specs/brief-contract.md` 生成 exploration brief')
  && codeExplore.includes('你通常会收到一个 exploration brief');

if (mode === 'red') {
  if (!ok) {
    fail('Expected brief contract, templates, intake skill, and code-explore agent to stay aligned');
  }
  pass('Red precondition no longer holds.');
}

if (!ok) {
  fail('Expected brief contract, templates, intake skill, and code-explore agent to stay aligned');
}

pass(mode === 'green' ? 'Green brief contract smoke passed.' : 'Brief contract verify smoke passed.');
