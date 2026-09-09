import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasFinalUserQuestion } from '../../benchmarks/competitive-v1/checkpoint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const benchmark = path.join(root, 'benchmarks', 'competitive-v1');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(benchmark, name), 'utf-8'));
const runner = fs.readFileSync(path.join(benchmark, 'run.mjs'), 'utf-8');
const reviewer = fs.readFileSync(path.join(benchmark, 'prepare-review.mjs'), 'utf-8');
const summarizer = fs.readFileSync(path.join(benchmark, 'summarize.mjs'), 'utf-8');
const sources = readJson('sources.json');
const rubric = readJson('rubric.json');
const pilot = readJson('pilot-2026-09-07.json');
const currentPilot = readJson('pilot-2026-09-09.json');

assert.deepEqual(sources.sources.map((item) => item.system), ['enterprise-harness', 'superpowers', 'openspec']);
for (const item of sources.sources.filter((source) => source.system !== 'enterprise-harness')) {
  assert.match(item.commit, /^[a-f0-9]{40}$/u);
  assert.doesNotMatch(item.version, /latest|main/u);
}
assert.match(runner, /spawnSync\(command, argv, \{ encoding: 'utf-8', shell: false/u);
assert.match(runner, /tokens_per_accepted_run|inputTokens|outputTokens/u);
assert.match(runner, /error_max_turns/u);
assert.match(runner, /remainingBudgetUsd/u);
assert.match(runner, /maxAgentTurnsPerInvocation = 60/u);
assert.match(runner, /terminationReason/u);
assert.match(runner, /pending-decisions/u);
assert.equal(hasFinalUserQuestion('Which option — or a different policy — should we use?'), true);
assert.equal(hasFinalUserQuestion('这是已经完成的说明。'), false);
assert.equal(hasFinalUserQuestion('Earlier question?\nI completed the plan.'), false);
assert.match(reviewer, /review-packets\.json/u);
assert.match(reviewer, /review-key\.json/u);
assert.match(summarizer, /tokensPerAcceptedRun/u);
assert.match(summarizer, /scoreIqr/u);
assert.deepEqual(rubric.aggregate.hardFailDimensions, ['decision_integrity', 'scope_safety']);
assert.equal(pilot.publishableConclusion, false);
assert.equal(currentPilot.publishableConclusion, false);
assert.equal(currentPilot.sampleSizePerSystem, 1);
assert.ok(currentPilot.conclusions.some((item) => /不能支持 Enterprise Harness 绝对更省 token/u.test(item)));
assert.ok(currentPilot.excludedRuns.length >= 2, 'failed and detector-polluted runs must remain disclosed');
assert.ok(pilot.conclusions.some((item) => /不能支持 Enterprise Harness 更省 token/u.test(item)));
assert.equal(new Set(pilot.records.map((item) => item.claudeCodeVersion).filter(Boolean)).size <= 1, true);

console.log('PASS competitive-benchmark-contract smoke');
