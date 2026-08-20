import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadHandoffV2, readClassificationArtifact } from '../../../runtime/api/handoff.mjs';
import { sha256Artifact, validateStageResult } from '../../../runtime/api/result.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-clarify-result.mjs <change-id> <run-id>');
  process.exit(2);
}

function assertRequirements(content) {
  const required = [
    '# Requirements',
    '## 目标与验收',
    '## 组件拓扑',
    '## Frontier',
    '## 事实、约束与条件分支',
    '## Classification',
    '## 未决决策与确认',
  ];
  const problems = required
    .filter((heading) => !content.includes(heading))
    .map((heading) => `requirements.md is missing ${heading}`);
  if (!/\bR\d+\b/u.test(content)) problems.push('requirements.md must contain stable requirement IDs');
  if (!/[-*]\s*confirmed\s*[:：]\s*true\b/iu.test(content)) problems.push('requirements.md must record confirmed: true');
  if (/\b(TODO|TBD|待补充|<[^>]+>)\b/iu.test(content)) problems.push('requirements.md contains an unresolved placeholder');
  return problems;
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'clarify'
    || input.agent?.type !== 'enterprise-harness:main' || input.agent?.skill !== 'harness') {
    throw new Error('EH-CLARIFY-FINALIZE-001: handoff must be a main-owned clarify execute run');
  }
  const requirementsPath = `harness/changes/${changeId}/requirements.md`;
  const classificationPath = `harness/changes/${changeId}/classification.json`;
  const requirementsAbsolute = path.join(root, requirementsPath);
  if (!fs.existsSync(requirementsAbsolute)) throw new Error(`EH-CLARIFY-FINALIZE-002: missing ${requirementsPath}`);
  const shapeProblems = assertRequirements(fs.readFileSync(requirementsAbsolute, 'utf-8'));
  if (shapeProblems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-003: ${shapeProblems.join('; ')}`);
  const classification = readClassificationArtifact(root, changeId, {
    path: classificationPath,
    digest: input.inputDigests?.[classificationPath],
  });
  const assertions = [
    { id: 'requirements-shape', verdict: 'pass', evidence: [requirementsPath] },
    { id: 'classification-fresh-and-valid', verdict: 'pass', evidence: [classificationPath] },
    { id: 'scope-confirmed', verdict: 'pass', evidence: [requirementsPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [
      { path: requirementsPath, digest: sha256Artifact(root, requirementsPath) },
      { path: classificationPath, digest: sha256Artifact(root, classificationPath) },
    ],
    assertions,
    selfCheck: {
      verdict: 'pass',
      findings: [],
      evidence: assertions.flatMap((assertion) => assertion.evidence),
    },
    tecpc: {
      ...input.tecpc,
      evidence: [...new Set([...input.tecpc.evidence, requirementsPath, classificationPath])],
      context: [...new Set([...input.tecpc.context, requirementsPath])],
      correction: null,
    },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-004: ${problems.join('; ')}`);
  void classification;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
