import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { computeValidationDigest } from './lib/checks.mjs';

const repoRoot = process.cwd();
const templatesDir = path.join(repoRoot, 'harness', 'templates');
const changesDir = path.join(repoRoot, 'harness', 'changes');
const activeFile = path.join(repoRoot, 'harness', 'ACTIVE_CHANGE');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function ensureChangeDir(changeId) {
  const changeDir = path.join(changesDir, changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'specs'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  return changeDir;
}

function cmdScaffold(changeId, owner = 'harness-governance', tier = 'L1') {
  const changeDir = ensureChangeDir(changeId);
  const statePath = path.join(changeDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    const data = readJson(path.join(templatesDir, 'state.json'));
    data.changeId = changeId;
    data.owner = owner;
    data.tier = tier;
    writeJson(statePath, data);
  }
  const files = [
    ['change.md', 'change.md'],
    ['validation.md', 'validation.md'],
    ['tooling-evidence.md', path.join('evidence', 'tooling.md')],
  ];
  for (const [template, rel] of files) {
    const target = path.join(changeDir, rel);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(templatesDir, template), target);
    }
  }
  console.log(`Scaffold ready: ${changeDir}`);
}

function cmdExploration(changeId, topic) {
  const changeDir = ensureChangeDir(changeId);
  const target = path.join(changeDir, 'evidence', `${topic}-exploration.md`);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(path.join(templatesDir, 'exploration.md'), target);
  }
  console.log(`Exploration ready: ${target}`);
}

function cmdState(changeId, state, tier) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const data = readJson(statePath);
  if (state === 'EXECUTING' && (!data.currentTask || !String(data.currentTask).trim())) {
    console.error('BLOCK: 进入 EXECUTING 前必须先设置非空 currentTask。');
    process.exit(2);
  }
  data.state = state;
  if (tier) data.tier = tier;
  writeJson(statePath, data);
  console.log(`State updated: ${changeId} -> ${state}${tier ? ` (${tier})` : ''}`);
}

function cmdCurrentTask(changeId, currentTask) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const data = readJson(statePath);
  data.currentTask = currentTask && currentTask.trim().length > 0 ? currentTask : null;
  writeJson(statePath, data);
  console.log(`Current task updated: ${changeId}`);
}

function cmdActive(changeId) {
  fs.writeFileSync(activeFile, changeId + '\n', 'utf-8');
  console.log(`Active change set: ${changeId}`);
}

function cmdShowActive() {
  if (!fs.existsSync(activeFile)) {
    console.error('No active change');
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(activeFile, 'utf-8'));
}

function cmdImpact(changeId, api, dataImpact, architecture, rule) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const json = readJson(statePath);
  json.impact = { api, data: dataImpact, architecture, rule };
  writeJson(statePath, json);
  console.log(`Impact updated: ${changeId}`);
}

function cmdReviewVerdict(changeId, reviewerId, verdict) {
  const reviewDir = path.join(changesDir, changeId, 'reviews');
  fs.mkdirSync(reviewDir, { recursive: true });
  const template = readJson(path.join(templatesDir, 'review-verdict.json'));
  template.changeId = changeId;
  template.reviewerId = reviewerId;
  template.verdict = verdict;
  writeJson(path.join(reviewDir, `${reviewerId}.json`), template);
  console.log(`Review verdict recorded: ${changeId}/${reviewerId}`);
}

function cmdMarkGate(changeId, gate, value, extra = null) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const json = readJson(statePath);
  json.gates = json.gates || {};
  json.gates[gate] = value;
  if (gate === 'redVerified') {
    if (!json.currentTask || !String(json.currentTask).trim()) {
      console.error('BLOCK: 标记 redVerified 前必须先设置非空 currentTask。');
      process.exit(2);
    }
    json.gates.redTask = String(json.currentTask).trim();
    json.gates.redEvidenceRef = extra || `${json.gates.redTask}-red-proof`;
  } else if (extra) {
    json.gates[`${gate}Ref`] = extra;
  }
  writeJson(statePath, json);
  console.log(`Gate updated: ${changeId} ${gate}=${value}`);
}

function cmdMarkValidated(changeId, _digest, date) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const json = readJson(statePath);
  json.state = 'VALIDATED';
  writeJson(statePath, json);
  const computedDigest = computeValidationDigest(repoRoot, changeId);
  if (!computedDigest) {
    console.error(`BLOCK: 无法为 ${changeId} 计算 validation digest。`);
    process.exit(2);
  }
  json.validation = {
    status: 'fresh',
    digest: computedDigest,
    validatedAt: date || new Date().toISOString().slice(0, 10),
  };
  writeJson(statePath, json);
  console.log(`Validated: ${changeId}`);
}

function cmdMarkValidationStale(changeId) {
  const statePath = path.join(changesDir, changeId, 'state.json');
  const json = readJson(statePath);
  json.validation = json.validation || {};
  json.validation.status = 'stale';
  json.validation.digest = null;
  json.validation.validatedAt = null;
  writeJson(statePath, json);
  console.log(`Validation marked stale: ${changeId}`);
}

const [, , action, ...args] = process.argv;
switch (action) {
  case 'scaffold': cmdScaffold(args[0], args[1], args[2]); break;
  case 'exploration': cmdExploration(args[0], args[1]); break;
  case 'state': cmdState(args[0], args[1], args[2]); break;
  case 'active': cmdActive(args[0]); break;
  case 'show-active': cmdShowActive(); break;
  case 'impact': cmdImpact(args[0], args[1], args[2], args[3], args[4]); break;
  case 'current-task': cmdCurrentTask(args[0], args.slice(1).join(' ')); break;
  case 'review-verdict': cmdReviewVerdict(args[0], args[1], args[2]); break;
  case 'design-approved': cmdMarkGate(args[0], 'designApproved', true); break;
  case 'red-verified': cmdMarkGate(args[0], 'redVerified', true, args[1] || null); break;
  case 'reviewed': cmdState(args[0], 'REVIEWED', args[1]); break;
  case 'validated': cmdMarkValidated(args[0], args[1], args[2]); break;
  case 'validation-stale': cmdMarkValidationStale(args[0]); break;
  default:
    console.log('Usage: node harness/plugin/runtime/lifecycle.mjs <action> ...');
    console.log('Actions: scaffold, exploration, state, active, show-active, impact, current-task, review-verdict, design-approved, red-verified, reviewed, validated, validation-stale');
    process.exit(1);
}
