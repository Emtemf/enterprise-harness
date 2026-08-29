import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2 } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';
import { assertNoSymlinkComponents, assertSafeId, assertSafeRunId, resolveChild } from '../../../runtime/api/task.mjs';
import { assertValidationShape } from '../assert/validation-shape.mjs';

const [changeId, runId] = process.argv.slice(2);

function acceptedCases(text) {
  const lines = text.split(/\r?\n/u);
  const header = lines.findIndex((line) => /^\|\s*TCID\s*\|/u.test(line));
  if (header < 0) return [];
  const cases = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 10 && /^TC[1-9][0-9]*$/u.test(cells[0]) && cells[9] === 'accepted') {
      cases.push({ id: cells[0], level: cells[2], priority: cells[3] });
    }
  }
  return cases;
}

function consumption(text) {
  const found = new Map();
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^-\s*(TC[1-9][0-9]*)\s*\|\s*(executed|skipped|unsupported)\s*\|\s*(\S+)/u);
    if (match) found.set(match[1], { status: match[2], receipt: match[3] });
  }
  return found;
}
if (!changeId || !runId) {
  console.error('Usage: node finalize-result.mjs <change-id> <run-id>');
  process.exit(2);
}

try {
  assertSafeId(changeId, 'changeId');
  assertSafeRunId(runId, 'runId');
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'verify'
    || input.agent?.type !== 'enterprise-harness:artifact-worker' || input.agent?.skill !== 'verify') {
    throw new Error('EH-VERIFY-FINALIZE-001: handoff must be a verify artifact-worker execute run');
  }
  if (input.behavior !== 'verify.collect') throw new Error('EH-VERIFY-FINALIZE-001: handoff must use verify.collect behavior');
  for (const ref of input.inputRefs) {
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-VERIFY-FINALIZE-005: handoff input digest is stale: ${ref}`);
    }
  }
  const changeDir = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
  const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
  if (!input.inputRefs.includes(testCasesRef)) throw new Error('EH-VERIFY-FINALIZE-006: test-cases input must be digest-bound');
  const testCasesPath = path.join(root, testCasesRef);
  assertNoSymlinkComponents(changeDir, testCasesPath, 'test-cases.md');
  if (!fs.existsSync(testCasesPath)) throw new Error('EH-VERIFY-FINALIZE-006: missing test-cases.md');
  const artifactPath = `harness/changes/${changeId}/validation.md`;
  const absolutePath = path.join(root, artifactPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`EH-VERIFY-FINALIZE-002: missing ${artifactPath}`);
  assertNoSymlinkComponents(changeDir, absolutePath, 'validation.md');
  const assertResult = assertValidationShape(fs.readFileSync(absolutePath, 'utf-8'));
  if (assertResult.verdict === 'block') {
    throw new Error(`EH-VERIFY-FINALIZE-003: ${assertResult.findings.join('; ')}`);
  }
  const cases = acceptedCases(fs.readFileSync(testCasesPath, 'utf-8'));
  const consumed = consumption(fs.readFileSync(absolutePath, 'utf-8'));
  const coverageProblems = [];
  for (const testCase of cases) {
    const result = consumed.get(testCase.id);
    if (!result) coverageProblems.push(`${testCase.id} is not consumed by validation`);
    else if (result.status === 'unsupported') coverageProblems.push(`${testCase.id} is unsupported and cannot pass`);
    else if (testCase.level === 'E2E' && testCase.priority === 'critical' && result.status !== 'executed') {
      coverageProblems.push(`critical E2E ${testCase.id} must be executed`);
    }
  }
  if (coverageProblems.length > 0) throw new Error(`EH-VERIFY-FINALIZE-007: ${coverageProblems.join('; ')}`);
  const assertions = [
    { id: assertResult.id, verdict: assertResult.verdict, evidence: assertResult.evidence },
    { id: 'test-case-consumption', verdict: 'pass', evidence: [testCasesRef, artifactPath] },
    { id: 'freshness-and-exceptions-recorded', verdict: 'pass', evidence: [artifactPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'verify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactPath, digest: sha256Artifact(root, artifactPath) }],
    assertions,
    selfCheck: { verdict: 'pass', findings: [], evidence: assertions.flatMap((assertion) => assertion.evidence) },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const validationProblems = validateStageResult(root, result);
  if (validationProblems.length > 0) throw new Error(`EH-VERIFY-FINALIZE-004: ${validationProblems.join('; ')}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
