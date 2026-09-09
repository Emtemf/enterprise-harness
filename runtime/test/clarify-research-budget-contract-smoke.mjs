import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];

const research = read('skills/harness/references/clarify-research.md');
const decisions = read('skills/harness/references/clarify-decisions.md');
const exploreSkill = read('skills/explore-code/SKILL.md');
const exploreAgent = read('agents/code-explore.md');
const seedRef = 'skills/harness/assets/requirements-research-seed.md.tmpl';
const briefFewShotRef = 'skills/harness/assets/research-brief-few-shot.md';

if (!exists(seedRef)) failures.push('Clarify must package a minimal research-seed requirements template');
if (!research.includes('../assets/requirements-research-seed.md.tmpl')) {
  failures.push('research phase must initialize requirements from the minimal research seed');
}
if (research.includes('此时读取 [requirements 模板](../assets/requirements.md.tmpl)')) {
  failures.push('research phase must not load the full requirements template before facts return');
}
if (!/Main[\s\S]{0,120}(?:禁止|不得)[\s\S]{0,80}ToolSearch[\s\S]{0,180}select:Skill/u.test(research)) {
  failures.push('research phase must prohibit Main fact ToolSearch while allowing only select:Skill discovery');
}
if (!decisions.includes('../assets/requirements.md.tmpl')) {
  failures.push('post-fact topology phase must expand the research seed with the full requirements template');
}
if (!exists(briefFewShotRef) || !research.includes('../assets/research-brief-few-shot.md')) {
  failures.push('research phase must consume a compact good/bad brief few-shot before dispatch');
}
if (!/最小[^\n]*(?:事实|evidence)[^\n]*(?:最高风险|frontier)/iu.test(research)) {
  failures.push('Main must scope each initial brief to the minimum facts needed for the highest-risk decision');
}
if (!/closure[^\n]*(?:一次|one)[^\n]*(?:CodeGraph|Context7)[^\n]*(?:fallback|query|查询)/iu.test(research)) {
  failures.push('Main must choose a brief closure reachable by one bounded research pass');
}
if (!/clarify close-research[\s\S]{0,500}(?:验证|validate)[\s\S]{0,300}(?:展开|expand)[^\n]*requirements/iu.test(research)) {
  failures.push('clean research packets must close and expand requirements through one runtime command');
}
if (!/close-research[\s\S]{0,600}(?:完整 brief ref|brief ref)[\s\S]{0,160}run_<UUID>[\s\S]{0,160}(?:canonical packet ref)/iu.test(research)) {
  failures.push('runtime research closure must own canonical lane rows without model-copied IDs or refs');
}
if (!/(?:Phase 2|第二阶段)[^\n]*pending skeleton/iu.test(research)
    || !/(?:禁止|不得)[^\n]*(?:提前|预先)[\s\S]{0,80}(?:topology|评分|Classification)/iu.test(research)) {
  failures.push('research closure must not precompute Phase 2 topology, scores, or classification');
}

if (exists(seedRef)) {
  const seed = read(seedRef);
  if (Buffer.byteLength(seed, 'utf8') > 1800) failures.push('research seed must stay below 1800 UTF-8 bytes');
  for (const required of ['### 原始需求', '### 澄清后的目标', '## 事实探索门禁', '| code |', '| docs |', 'fact gate complete：false']) {
    if (!seed.includes(required)) failures.push(`research seed must preserve ${required}`);
  }
  for (const deferred of ['## 组件拓扑', '## Component × Dimension 评分', '## Frontier', '## Classification']) {
    if (seed.includes(deferred)) failures.push(`research seed must defer ${deferred}`);
  }
}

for (const source of [exploreSkill, exploreAgent]) {
  if (!source.includes('select:mcp__plugin_enterprise-harness_codegraph__codegraph_search,mcp__plugin_enterprise-harness_codegraph__codegraph_explore')) {
    failures.push('code exploration must use the verified fully-qualified deferred-tool query');
  }
  if (!/projectPath[^\n]*(?:必填|必须)/u.test(source)) {
    failures.push('the first CodeGraph call must always include projectPath');
  }
  if (!/(?:未索引|未初始化|not initialized)[^\n]*(?:不得|禁止)[^\n]*\.codegraph/iu.test(source)) {
    failures.push('an uninitialized result must not spend the discovery Glob searching for .codegraph');
  }
  if (!/(?:首次|第一次)[\s\S]{0,80}Glob[\s\S]{0,120}(?:源码|source)[\s\S]{0,80}(?:候选|文件)/iu.test(source)) {
    failures.push('the first fallback Glob must enumerate scoped source candidates directly');
  }
  if (!/只允许一次 `?ToolSearch`?/u.test(source)) {
    failures.push('code exploration must allow exactly one deferred CodeGraph ToolSearch');
  }
  if (!/tool_reference[\s\S]{0,100}(?:立即|下一步)[\s\S]{0,80}(?:调用|invoke)/iu.test(source)) {
    failures.push('code exploration must treat a ToolSearch tool_reference as available and invoke it next');
  }
  if (!/最多[^\n]*2[^\n]*Glob[^\n]*6[^\n]*(?:Read|文件)/u.test(source)) {
    failures.push('code exploration fallback must cap discovery at two Globs and six focused Reads');
  }
  if (!/(?:不得|禁止)[^\n]*(?:插件|hook|receipt|治理)/u.test(source)) {
    failures.push('code exploration fallback must forbid debugging Harness governance internals');
  }
  if (!/fallback[^\n]*(?:完整|穷尽)[^\n]*degraded=false/iu.test(source)) {
    failures.push('bounded complete fallback must not be marked degraded merely because fallback occurred');
  }
  if (!/uncertainties[\s\S]{0,140}(?:事实|fact)[\s\S]{0,140}(?:业务|设计)[\s\S]{0,140}recommendedDecision/iu.test(source)) {
    failures.push('worker must separate unresolved facts from business/design decisions');
  }
  if (!/closure[^\n]*(?:满足|关闭)[^\n]*uncertainties=\[\]/iu.test(source)) {
    failures.push('worker must emit no bonus uncertainty after the brief closure is satisfied');
  }
}

for (const relative of ['skills/research-docs/SKILL.md', 'agents/doc-research.md']) {
  const source = read(relative);
  if (!/最多[^\n]*1[^\n]*(?:resolve|解析)[^\n]*2[^\n]*(?:query|查询)/iu.test(source)) {
    failures.push('docs research must cap Context7 to one resolve and two focused queries');
  }
  if (!/uncertainties[\s\S]{0,140}(?:事实|fact)[\s\S]{0,140}(?:业务|产品)[\s\S]{0,140}recommendedDecision/iu.test(source)) {
    failures.push('docs worker must separate unresolved facts from product decisions');
  }
  if (!/closure[^\n]*(?:满足|关闭)[^\n]*uncertainties=\[\]/iu.test(source)) {
    failures.push('docs worker must emit no bonus uncertainty after the brief closure is satisfied');
  }
  if (!/(?:辅助|supporting)[^\n]*(?:API|symbol|调用)[\s\S]{0,180}(?:范围外|scope 外|不得)[\s\S]{0,120}uncertaint/iu.test(source)) {
    failures.push('docs worker must not promote an unrequested supporting API detail into a blocking uncertainty');
  }
  if (!/Context7[^\n]*(?:不足|insufficient)/iu.test(source)
      || !/(?:必须|must)[\s\S]{0,100}(?:官方|vendor)/iu.test(source)
      || !/(?:之后|after)[\s\S]{0,80}(?:返回|emit)[^\n]*uncertaint/iu.test(source)) {
    failures.push('docs worker must attempt one official fallback before returning a Context7 coverage uncertainty');
  }
}

if (mode === 'red') {
  assert.ok(failures.length > 0, 'research budget contract is already complete; choose a new RED target');
  console.log(`RED clarify-research-budget-contract: ${failures.join('; ')}`);
} else {
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`PASS clarify-research-budget-contract ${mode}`);
}
