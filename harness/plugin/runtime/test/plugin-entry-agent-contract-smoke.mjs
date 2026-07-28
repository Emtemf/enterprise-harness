import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectBareDispatchMentions(content, logicalAgent) {
  const bareToken = `\`${logicalAgent}\``;
  const scopedToken = `\`enterprise-harness:${logicalAgent}\``;
  const results = [];
  const dispatchContexts = [
    'subagent_type',
    'Agent',
    'agent',
    '派',
    '再派',
    '先派',
    '补',
    '委托',
    '使用',
    '通过',
    '调用',
    '会派',
    '默认走',
    '返回到',
    '恢复到',
    '→',
  ];
  for (const line of content.split(/\r?\n/u)) {
    if (!line.includes(bareToken)) continue;
    if (line.includes(scopedToken)) continue;
    if (!dispatchContexts.some((context) => line.includes(context))) continue;
    results.push(line.trim());
  }
  return results;
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const pluginJson = JSON.parse(read('.claude-plugin/plugin.json'));
const harnessSkill = read('.claude/skills/harness/SKILL.md');
const intakeSkill = read('.claude/skills/harness-intake/SKILL.md');
const designSkill = read('.claude/skills/harness-design/SKILL.md');
const planSkill = read('.claude/skills/harness-plan/SKILL.md');
const verifySkill = read('.claude/skills/harness-verify/SKILL.md');
const tddSkill = read('.claude/skills/harness-tdd/SKILL.md');
const codeAnalysisRule = read('.claude/rules/10-code-analysis.md');
const executorAgent = read('.claude/agents/tdd-executor.md');
const reviewerAgents = {
  docResearch: read('.claude/agents/doc-research.md'),
  designReviewer: read('.claude/agents/design-reviewer.md'),
  apiConsistencyReviewer: read('.claude/agents/api-consistency-reviewer.md'),
  planCritic: read('.claude/agents/plan-critic.md'),
  verificationReviewer: read('.claude/agents/verification-reviewer.md'),
};
const touchedTextFiles = [
  '.claude/skills/harness/SKILL.md',
  '.claude/skills/harness-intake/SKILL.md',
  '.claude/skills/harness-design/SKILL.md',
  '.claude/skills/harness-plan/SKILL.md',
  '.claude/skills/harness-tdd/SKILL.md',
  '.claude/skills/harness-verify/SKILL.md',
  '.claude/rules/10-code-analysis.md',
].map((relativePath) => ({
  relativePath,
  content: read(relativePath),
}));
const pluginStageSkills = touchedTextFiles.filter((entry) => entry.relativePath.startsWith('.claude/skills/'));
const knownLogicalAgents = [
  'code-explore',
  'doc-research',
  'design-reviewer',
  'api-consistency-reviewer',
  'plan-critic',
  'tdd-executor',
  'verification-reviewer',
];

const requiredScopedDispatch = [
  {
    file: '.claude/skills/harness/SKILL.md',
    content: harnessSkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:code-explore',
      'enterprise-harness:doc-research',
      'enterprise-harness:design-reviewer',
      'enterprise-harness:plan-critic',
      'enterprise-harness:tdd-executor',
      'enterprise-harness:verification-reviewer',
    ],
  },
  {
    file: '.claude/skills/harness-intake/SKILL.md',
    content: intakeSkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:code-explore',
      'enterprise-harness:doc-research',
    ],
  },
  {
    file: '.claude/skills/harness-design/SKILL.md',
    content: designSkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:code-explore',
      'enterprise-harness:doc-research',
      'enterprise-harness:design-reviewer',
      'enterprise-harness:api-consistency-reviewer',
    ],
  },
  {
    file: '.claude/skills/harness-plan/SKILL.md',
    content: planSkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:plan-critic',
    ],
  },
  {
    file: '.claude/skills/harness-tdd/SKILL.md',
    content: tddSkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:tdd-executor',
    ],
  },
  {
    file: '.claude/skills/harness-verify/SKILL.md',
    content: verifySkill,
    required: [
      '/enterprise-harness:harness',
      'enterprise-harness:verification-reviewer',
    ],
  },
];

const failures = [];
const pluginCommandPath = path.join(repoRoot, '.claude-plugin/commands/harness.md');
if (Object.hasOwn(pluginJson, 'commands')) {
  failures.push('plugin.json must not declare a commands entry once the canonical plugin entry is the namespaced skill');
}
if (fs.existsSync(pluginCommandPath)) {
  failures.push('.claude-plugin/commands/harness.md must be removed to avoid command/skill collision');
}
for (const { file, content, required } of requiredScopedDispatch) {
  for (const token of required) {
    if (!content.includes(token)) {
      failures.push(`${file} must include ${token}`);
    }
  }
}
for (const { relativePath, content } of pluginStageSkills) {
  if (!content.includes('/enterprise-harness:harness')) {
    failures.push(`${relativePath} must acknowledge /enterprise-harness:harness as the plugin entry`);
  }
}
if (!codeAnalysisRule.includes('enterprise-harness:code-explore')) {
  failures.push('10-code-analysis.md must name enterprise-harness:code-explore explicitly');
}
for (const { relativePath, content } of touchedTextFiles) {
  if (/回退到\s*`general-purpose`|临时使用\s*`general-purpose`|fallback\s+to\s+`general-purpose`/u.test(content)) {
    failures.push(`${relativePath} still advertises a general-purpose fallback`);
  }
  for (const logicalAgent of knownLogicalAgents) {
    const bareMentions = collectBareDispatchMentions(content, logicalAgent);
    for (const mention of bareMentions) {
      failures.push(`${relativePath} still contains bare plugin-facing dispatch prose for ${logicalAgent}: ${mention}`);
    }
  }
  const bareSubtype = new RegExp(`subagent_type\\s*:\\s*` + '`?' + `${escapeRegExp('code-explore')}` + '`?', 'u');
  if (bareSubtype.test(content)) {
    failures.push(`${relativePath} still references bare code-explore instead of enterprise-harness:code-explore`);
  }
  const bareExecutorSubtype = new RegExp(`subagent_type\\s*:\\s*` + '`?' + `${escapeRegExp('tdd-executor')}` + '`?', 'u');
  if (bareExecutorSubtype.test(content)) {
    failures.push(`${relativePath} still references bare tdd-executor instead of enterprise-harness:tdd-executor`);
  }
}
if (!/^name:\s*tdd-executor$/m.test(executorAgent)) {
  failures.push('tdd-executor agent logical id must remain name: tdd-executor');
}
if (/^name:\s*enterprise-harness:tdd-executor$/m.test(executorAgent)) {
  failures.push('tdd-executor frontmatter must keep the logical id, not rename it to a scoped plugin id');
}
if (!/^isolation:\s*worktree$/m.test(executorAgent)) {
  failures.push('tdd-executor frontmatter must declare isolation: worktree');
}
const logicalReviewerIdChecks = [
  ['doc-research', reviewerAgents.docResearch],
  ['design-reviewer', reviewerAgents.designReviewer],
  ['api-consistency-reviewer', reviewerAgents.apiConsistencyReviewer],
  ['plan-critic', reviewerAgents.planCritic],
  ['verification-reviewer', reviewerAgents.verificationReviewer],
];
for (const [logicalName, content] of logicalReviewerIdChecks) {
  if (!new RegExp(`^name:\\s*${escapeRegExp(logicalName)}$`, 'm').test(content)) {
    failures.push(`${logicalName} agent logical id must remain name: ${logicalName}`);
  }
  if (new RegExp(`^name:\\s*enterprise-harness:${escapeRegExp(logicalName)}$`, 'm').test(content)) {
    failures.push(`${logicalName} agent frontmatter must keep the logical id, not a scoped plugin id`);
  }
}

const ok = failures.length === 0;
if (mode === 'red') {
  if (!ok) {
    fail(`Expected plugin entry / agent contract to fail before implementation:\n${failures.join('\n')}`);
  }
  pass('Red precondition no longer holds.');
}
if (!ok) {
  fail(`Expected plugin entry / agent contract to pass:\n${failures.join('\n')}`);
}
pass(mode === 'green' ? 'Green plugin-entry-agent-contract smoke passed.' : 'Plugin entry / agent contract verify smoke passed.');
