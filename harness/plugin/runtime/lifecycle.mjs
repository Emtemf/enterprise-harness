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

  const guideTarget = path.join(changeDir, 'GUIDE.md');
  if (!fs.existsSync(guideTarget)) {
    const state = readJson(statePath);
    const guideTemplate = fs.readFileSync(path.join(templatesDir, 'guide.md'), 'utf-8');
    const guideText = guideTemplate
      .replaceAll('{{CHANGE_ID}}', String(changeId))
      .replaceAll('{{TIER}}', String(tier))
      .replaceAll('{{IMPACT_API}}', String(state.impact?.api ?? 'unknown'))
      .replaceAll('{{IMPACT_DATA}}', String(state.impact?.data ?? 'unknown'))
      .replaceAll('{{IMPACT_ARCHITECTURE}}', String(state.impact?.architecture ?? 'unknown'))
      .replaceAll('{{IMPACT_RULE}}', String(state.impact?.rule ?? 'unknown'));
    fs.writeFileSync(guideTarget, guideText, 'utf-8');
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

const archiveDir = path.join(repoRoot, 'harness', 'archive');
const testDir = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test');

// 自动归档：把已 VALIDATED 的 change 物理移到 harness/archive/，置 ARCHIVED，清 active 指针。
function cmdArchive(changeId) {
  if (!changeId) {
    console.error('BLOCK: archive 需要 <changeId>。');
    process.exit(2);
  }
  const srcDir = path.join(changesDir, changeId);
  const statePath = path.join(srcDir, 'state.json');
  // 1. 存在性校验。
  if (!fs.existsSync(statePath)) {
    console.error(`BLOCK: change 不存在或缺少 state.json：${changeId}`);
    process.exit(2);
  }
  const data = readJson(statePath);
  // 2. 只允许归档已 VALIDATED 的 change，避免误归档半成品。
  if (data.state !== 'VALIDATED') {
    console.error(`BLOCK: 只有 VALIDATED 才能归档，当前 state=${data.state}。`);
    process.exit(2);
  }
  // 3. 被 runtime smoke 硬编码引用的 change 不能归档，否则会打断 smoke。
  if (isReferencedByTests(changeId)) {
    console.error(`BLOCK: ${changeId} 仍被 harness/plugin/runtime/test 引用，归档会破坏 smoke，先解除引用。`);
    process.exit(2);
  }
  const destDir = path.join(archiveDir, changeId);
  if (fs.existsSync(destDir)) {
    console.error(`BLOCK: 归档目标已存在：harness/archive/${changeId}`);
    process.exit(2);
  }
  // 4. 置 ARCHIVED 后物理移动。
  data.state = 'ARCHIVED';
  writeJson(statePath, data);
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(srcDir, destDir);
  // 5. 若归档的是当前 active change，清空指针。
  if (fs.existsSync(activeFile)) {
    const active = fs.readFileSync(activeFile, 'utf-8').trim();
    if (active === changeId) fs.rmSync(activeFile);
  }
  console.log(`Archived: ${changeId} -> harness/archive/${changeId}`);
}

function isReferencedByTests(changeId) {
  if (!fs.existsSync(testDir)) return false;
  for (const entry of fs.readdirSync(testDir)) {
    if (!entry.endsWith('.mjs')) continue;
    const text = fs.readFileSync(path.join(testDir, entry), 'utf-8');
    if (text.includes(changeId)) return true;
  }
  return false;
}

const lessonsDir = path.join(repoRoot, 'harness', 'lessons');
const lessonsIndex = path.join(lessonsDir, 'INDEX.md');

// 跨 change 教训库：记录一条 lesson 并同步索引，供后续 clarify 阶段先行检索、避免同样问题重复发生。
function cmdLessonAdd(slug, severity = 'medium', tags = '', sourceChange = '', date) {
  if (!slug) {
    console.error('BLOCK: lesson-add 需要 <slug>。');
    process.exit(2);
  }
  fs.mkdirSync(lessonsDir, { recursive: true });
  const recordedAt = date || new Date().toISOString().slice(0, 10);
  const normalizedTags = tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const lessonPath = path.join(lessonsDir, `${slug}.md`);
  // 1. 幂等：已存在则不覆盖正文，只保证索引里有该条。
  if (!fs.existsSync(lessonPath)) {
    const body = [
      '---',
      `id: ${slug}`,
      `severity: ${severity}`,
      `tags: [${normalizedTags.join(', ')}]`,
      `sourceChange: ${sourceChange}`,
      `recordedAt: ${recordedAt}`,
      '---',
      '',
      `# ${slug}`,
      '',
      '## 症状',
      '',
      '（待补充：可观察到的错误现象）',
      '',
      '## 根因',
      '',
      '（待补充：为什么会发生）',
      '',
      '## 规避',
      '',
      '（待补充：下次如何避免）',
      '',
    ].join('\n');
    fs.writeFileSync(lessonPath, body, 'utf-8');
  }
  // 2. 更新索引：确保 INDEX.md 的 marker 区间内包含该条。
  ensureLessonsIndex();
  const indexLine = `- ${slug} — ${severity} — ${normalizedTags.join(', ')}`;
  const raw = fs.readFileSync(lessonsIndex, 'utf-8');
  const begin = '<!-- LESSONS:BEGIN -->';
  const end = '<!-- LESSONS:END -->';
  const before = raw.slice(0, raw.indexOf(begin) + begin.length);
  const after = raw.slice(raw.indexOf(end));
  const middle = raw.slice(raw.indexOf(begin) + begin.length, raw.indexOf(end));
  const lines = middle.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  const existing = lines.filter((l) => !l.startsWith(`- ${slug} `));
  existing.push(indexLine);
  existing.sort();
  fs.writeFileSync(lessonsIndex, `${before}\n${existing.join('\n')}\n${after}`, 'utf-8');
  console.log(`Lesson recorded: ${slug}`);
}

function ensureLessonsIndex() {
  fs.mkdirSync(lessonsDir, { recursive: true });
  if (fs.existsSync(lessonsIndex)) return;
  const seed = [
    '# Lessons Index',
    '',
    '本文件是跨 change 的经验/教训索引。每行一条：`id — severity — tags`。',
    '',
    '<!-- LESSONS:BEGIN -->',
    '<!-- LESSONS:END -->',
    '',
  ].join('\n');
  fs.writeFileSync(lessonsIndex, seed, 'utf-8');
}

function cmdLessonList(tagFilter) {
  if (!fs.existsSync(lessonsIndex)) {
    console.log('（暂无 lessons）');
    return;
  }
  const raw = fs.readFileSync(lessonsIndex, 'utf-8');
  const begin = '<!-- LESSONS:BEGIN -->';
  const end = '<!-- LESSONS:END -->';
  const middle = raw.slice(raw.indexOf(begin) + begin.length, raw.indexOf(end));
  const lines = middle.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  const filtered = tagFilter ? lines.filter((l) => l.includes(tagFilter)) : lines;
  if (filtered.length === 0) {
    console.log(tagFilter ? `（无匹配 tag=${tagFilter} 的 lesson）` : '（暂无 lessons）');
    return;
  }
  for (const line of filtered) console.log(line);
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
  case 'archive': cmdArchive(args[0]); break;
  case 'lesson-add': cmdLessonAdd(args[0], args[1], args[2], args[3], args[4]); break;
  case 'lesson-list': cmdLessonList(args[0]); break;
  default:
    console.log('Usage: node harness/plugin/runtime/lifecycle.mjs <action> ...');
    console.log('Actions: scaffold, exploration, state, active, show-active, impact, current-task, review-verdict, design-approved, red-verified, reviewed, validated, validation-stale, archive, lesson-add, lesson-list');
    process.exit(1);
}
