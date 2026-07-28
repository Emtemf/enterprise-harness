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

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const pluginJson = JSON.parse(read('.claude-plugin/plugin.json'));
const harnessSkill = read('.claude/skills/harness/SKILL.md');
const intakeSkill = read('.claude/skills/harness-intake/SKILL.md');
const tddSkill = read('.claude/skills/harness-tdd/SKILL.md');
const codeAnalysisRule = read('.claude/rules/10-code-analysis.md');
const executorAgent = read('.claude/agents/tdd-executor.md');
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

const failures = [];
const pluginCommandPath = path.join(repoRoot, '.claude-plugin/commands/harness.md');
if (Object.hasOwn(pluginJson, 'commands')) {
  failures.push('plugin.json must not declare a commands entry once the canonical plugin entry is the namespaced skill');
}
if (fs.existsSync(pluginCommandPath)) {
  failures.push('.claude-plugin/commands/harness.md must be removed to avoid command/skill collision');
}
if (!harnessSkill.includes('/enterprise-harness:harness')) {
  failures.push('harness skill must document /enterprise-harness:harness as the plugin canonical entry');
}
if (!harnessSkill.includes('standalone') || !harnessSkill.includes('/harness')) {
  failures.push('harness skill must preserve /harness for standalone source checkouts');
}
if (!intakeSkill.includes('/enterprise-harness:harness')) {
  failures.push('harness-intake skill must reference the namespaced plugin entry');
}
for (const { relativePath, content } of pluginStageSkills) {
  if (!content.includes('/enterprise-harness:harness')) {
    failures.push(`${relativePath} must acknowledge /enterprise-harness:harness as the plugin entry`);
  }
}
if (!tddSkill.includes('enterprise-harness:tdd-executor')) {
  failures.push('harness-tdd skill must dispatch enterprise-harness:tdd-executor');
}
if (!harnessSkill.includes('enterprise-harness:code-explore')) {
  failures.push('harness skill must dispatch enterprise-harness:code-explore');
}
if (!intakeSkill.includes('enterprise-harness:code-explore')) {
  failures.push('harness-intake skill must dispatch enterprise-harness:code-explore');
}
if (!codeAnalysisRule.includes('enterprise-harness:code-explore')) {
  failures.push('10-code-analysis.md must name enterprise-harness:code-explore explicitly');
}
for (const { relativePath, content } of touchedTextFiles) {
  if (/subagent_type\s*:\s*`?code-explore`?/u.test(content)) {
    failures.push(`${relativePath} still references bare code-explore instead of enterprise-harness:code-explore`);
  }
  if (/subagent_type\s*:\s*`?tdd-executor`?/u.test(content)) {
    failures.push(`${relativePath} still references bare tdd-executor instead of enterprise-harness:tdd-executor`);
  }
  if (/回退到\s*`general-purpose`|临时使用\s*`general-purpose`|fallback\s+to\s+`general-purpose`/u.test(content)) {
    failures.push(`${relativePath} still advertises a general-purpose fallback`);
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
