import fs from 'node:fs';
import path from 'node:path';
import {
  isSafeId,
  resolveChild,
  resolveWithin,
  assertNoSymlinkComponents,
} from '../lib/safe-paths.mjs';
import {
  sha256Artifact,
  validateCompletionProof,
  validateReviewResult,
  validateStageResult,
  validateTecpc,
} from '../lib/result-contract.mjs';

const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const ARCHITECTURE_PROOF_FIELDS = new Set([
  'proofVersion',
  'type',
  'changeId',
  'executionRunId',
  'reviewRunId',
  'artifacts',
  'inputDigests',
  'tecpc',
  'createdAt',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameArtifacts(left, right) {
  const normalize = (artifacts) => (artifacts || [])
    .map(({ path: artifactPath, digest }) => [artifactPath, digest])
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function architectureError(problems) {
  return new Error(`EH-DESIGN-PROOF-001: ${problems.join('; ')}`);
}

export function designArchitectureProofRef(changeId) {
  if (!isSafeId(changeId)) throw new Error('EH-PATH-001: changeId must be a safe identifier');
  return `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
}

export function validateDesignArchitectureProof(root, proof) {
  const problems = [];
  if (!isObject(proof)) return ['architecture proof must be an object'];
  for (const key of Object.keys(proof)) {
    if (!ARCHITECTURE_PROOF_FIELDS.has(key)) problems.push(`architecture proof has unknown property ${key}`);
  }
  if (proof.proofVersion !== 1) problems.push('proofVersion must be 1');
  if (proof.type !== 'design-architecture-proof') problems.push('type must be design-architecture-proof');
  if (!isSafeId(proof.changeId)) problems.push('changeId must be a safe identifier');
  if (!RUN_ID.test(String(proof.executionRunId || ''))) problems.push('executionRunId must be a v2 run id');
  if (!RUN_ID.test(String(proof.reviewRunId || ''))) problems.push('reviewRunId must be a v2 run id');
  if (proof.executionRunId === proof.reviewRunId) problems.push('architecture proof requires independent execution and review runs');

  const expectedDesignRef = isSafeId(proof.changeId)
    ? `harness/changes/${proof.changeId}/design.md`
    : null;
  if (!Array.isArray(proof.artifacts) || proof.artifacts.length !== 1) {
    problems.push('architecture proof must contain exactly one design artifact');
  } else {
    const artifact = proof.artifacts[0];
    if (!isObject(artifact)
        || Object.keys(artifact).some((key) => !['path', 'digest'].includes(key))
        || artifact.path !== expectedDesignRef
        || !DIGEST.test(String(artifact.digest || ''))) {
      problems.push(`architecture proof artifact must bind ${expectedDesignRef || 'the canonical design path'}`);
    } else {
      try {
        if (sha256Artifact(root, artifact.path) !== artifact.digest) {
          problems.push(`architecture proof artifact digest is stale: ${artifact.path}`);
        }
      } catch (error) {
        problems.push(`architecture proof artifact is unreadable: ${artifact.path} (${error.message})`);
      }
    }
  }

  if (!isObject(proof.inputDigests)) {
    problems.push('inputDigests must be an object');
  } else {
    for (const [ref, digest] of Object.entries(proof.inputDigests)) {
      if (!ref || !DIGEST.test(String(digest || ''))) {
        problems.push(`inputDigests.${ref || '<empty>'} must be a sha256 digest`);
        continue;
      }
      try {
        if (sha256Artifact(root, ref) !== digest) problems.push(`architecture proof input digest is stale: ${ref}`);
      } catch (error) {
        problems.push(`architecture proof input is unreadable: ${ref} (${error.message})`);
      }
    }
  }
  problems.push(...validateTecpc(proof.tecpc).map((problem) => `architecture proof ${problem}`));
  if (proof.tecpc?.correction !== null) problems.push('architecture proof TECPC requires correction=null');
  if (typeof proof.createdAt !== 'string' || !Number.isFinite(Date.parse(proof.createdAt))) {
    problems.push('createdAt must be an ISO timestamp');
  }
  return problems;
}

export function buildDesignArchitectureProof(root, stageResult, reviewResult) {
  const expectedDesignRef = isSafeId(stageResult?.changeId)
    ? `harness/changes/${stageResult.changeId}/design.md`
    : null;
  const problems = [
    ...validateStageResult(root, stageResult),
    ...validateReviewResult(root, reviewResult, { stageResult }),
  ];
  if (stageResult?.stage !== 'design') problems.push('architecture StageResult stage must be design');
  if (stageResult?.producer?.agentType !== 'enterprise-harness:artifact-worker'
      || stageResult?.producer?.skill !== 'design') {
    problems.push('architecture StageResult producer must be the design artifact-worker');
  }
  if (stageResult?.status !== 'pass' || stageResult?.selfCheck?.verdict !== 'pass') {
    problems.push('architecture StageResult self-check must pass');
  }
  if (reviewResult?.verdict !== 'pass') problems.push('architecture ReviewResult must pass');
  if (!sameArtifacts(stageResult?.artifacts, reviewResult?.reviewedArtifacts)) {
    problems.push('architecture review artifacts must match the StageResult');
  }
  if (!Array.isArray(stageResult?.artifacts)
      || stageResult.artifacts.length !== 1
      || stageResult.artifacts[0]?.path !== expectedDesignRef) {
    problems.push(`architecture StageResult must bind exactly ${expectedDesignRef || 'design.md'}`);
  }
  if (stageResult?.tecpc?.correction !== null
      || reviewResult?.tecpc?.correction !== null
      || reviewResult?.correction !== null) {
    problems.push('architecture TECPC correction remains pending');
  }
  if (problems.length > 0) throw architectureError(problems);

  const proof = {
    proofVersion: 1,
    type: 'design-architecture-proof',
    changeId: stageResult.changeId,
    executionRunId: stageResult.runId,
    reviewRunId: reviewResult.runId,
    artifacts: stageResult.artifacts.map((artifact) => ({ ...artifact })),
    inputDigests: { ...stageResult.inputDigests },
    tecpc: {
      ...stageResult.tecpc,
      evidence: [...stageResult.tecpc.evidence],
      context: [...stageResult.tecpc.context],
    },
    createdAt: new Date().toISOString(),
  };
  const proofProblems = validateDesignArchitectureProof(root, proof);
  if (proofProblems.length > 0) throw architectureError(proofProblems);
  return Object.freeze(proof);
}

export function sameDesignArchitectureProofBinding(left, right) {
  return left?.proofVersion === right?.proofVersion
    && left?.type === right?.type
    && left?.changeId === right?.changeId
    && left?.executionRunId === right?.executionRunId
    && left?.reviewRunId === right?.reviewRunId
    && sameArtifacts(left?.artifacts, right?.artifacts)
    && sameDigestMap(left?.inputDigests, right?.inputDigests)
    && JSON.stringify(left?.tecpc || null) === JSON.stringify(right?.tecpc || null);
}

export function readDesignArchitectureProof(root, changeId) {
  const ref = designArchitectureProofRef(changeId);
  let changeRoot;
  let target;
  try {
    changeRoot = resolveChild(path.join(root, 'harness', 'changes'), changeId, 'changeId');
    target = resolveWithin(changeRoot, 'evidence/completion/design-architecture.json', 'architecture proof');
    assertNoSymlinkComponents(changeRoot, target, 'architecture proof');
  } catch (error) {
    if (String(error.message).includes('EH-PATH-001')) throw error;
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  if (!fs.existsSync(target)) throw architectureError([`architecture proof is missing: ${ref}`]);
  let proof;
  try {
    proof = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (error) {
    throw architectureError([`architecture proof is invalid JSON: ${error.message}`]);
  }
  const problems = validateDesignArchitectureProof(root, proof);
  if (proof.changeId !== changeId) problems.push(`architecture proof changeId must be ${changeId}`);
  if (problems.length > 0) throw architectureError(problems);
  return Object.freeze(proof);
}

export function buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview) {
  const problems = [
    ...validateDesignArchitectureProof(root, architectureProof),
    ...validateStageResult(root, testDesignResult),
    ...validateReviewResult(root, testDesignReview, { stageResult: testDesignResult }),
  ];
  const changeId = architectureProof?.changeId;
  const designRef = isSafeId(changeId) ? `harness/changes/${changeId}/design.md` : null;
  const testCasesRef = isSafeId(changeId) ? `harness/changes/${changeId}/test-cases.md` : null;
  const architectureRef = isSafeId(changeId) ? designArchitectureProofRef(changeId) : null;
  const designArtifact = architectureProof?.artifacts?.[0];
  const testCasesArtifact = testDesignResult?.artifacts?.[0];

  if (testDesignResult?.changeId !== changeId || testDesignReview?.changeId !== changeId) {
    problems.push('test-design chain must bind the architecture proof change');
  }
  if (testDesignResult?.stage !== 'design') problems.push('test-design StageResult stage must be design');
  if (testDesignResult?.producer?.agentType !== 'enterprise-harness:test-design-worker'
      || testDesignResult?.producer?.skill !== 'test-design') {
    problems.push('test-design StageResult producer must be the test-design worker');
  }
  if (testDesignResult?.status !== 'pass' || testDesignResult?.selfCheck?.verdict !== 'pass') {
    problems.push('test-design StageResult self-check must pass');
  }
  if (testDesignReview?.verdict !== 'pass') problems.push('test-design ReviewResult must pass');
  if (!sameArtifacts(testDesignResult?.artifacts, testDesignReview?.reviewedArtifacts)) {
    problems.push('test-design review artifacts must match the StageResult');
  }
  if (!Array.isArray(testDesignResult?.artifacts)
      || testDesignResult.artifacts.length !== 1
      || testCasesArtifact?.path !== testCasesRef) {
    problems.push(`test-design StageResult must bind exactly ${testCasesRef || 'test-cases.md'}`);
  }
  if (designArtifact?.path !== designRef
      || testDesignResult?.inputDigests?.[designRef] !== designArtifact?.digest) {
    problems.push('test-design StageResult must digest-bind the Architecture Design artifact');
  }
  if (architectureRef) {
    let architectureDigest = null;
    try {
      architectureDigest = sha256Artifact(root, architectureRef);
    } catch (error) {
      problems.push(`architecture proof is unreadable: ${error.message}`);
    }
    if (testDesignResult?.inputDigests?.[architectureRef] !== architectureDigest) {
      problems.push('test-design StageResult must digest-bind design-architecture.json');
    }
  }
  if (testDesignResult?.tecpc?.correction !== null
      || testDesignReview?.tecpc?.correction !== null
      || testDesignReview?.correction !== null) {
    problems.push('test-design TECPC correction remains pending');
  }
  if (problems.length > 0) throw architectureError(problems);

  const context = [...new Set([
    ...Object.keys(architectureProof.inputDigests || {}),
    ...Object.keys(testDesignResult.inputDigests || {}),
  ])];
  const proof = {
    proofVersion: 1,
    type: 'completion-proof',
    changeId,
    stage: 'design',
    stageProofs: [
      {
        kind: 'architecture',
        executionRunId: architectureProof.executionRunId,
        reviewRunId: architectureProof.reviewRunId,
        artifacts: [{ ...designArtifact }],
      },
      {
        kind: 'test-design',
        executionRunId: testDesignResult.runId,
        reviewRunId: testDesignReview.runId,
        artifacts: [{ ...testCasesArtifact }],
      },
    ],
    artifacts: [{ ...designArtifact }, { ...testCasesArtifact }],
    waivers: [],
    target: 'complete architecture and test design',
    evidence: [designArtifact.path, testCasesArtifact.path],
    context: context.length > 0 ? context : [designArtifact.path],
    path: `${designArtifact.path} -> ${architectureRef} -> ${testCasesArtifact.path}`,
    createdAt: new Date().toISOString(),
  };
  const proofProblems = validateCompletionProof(root, proof);
  if (proofProblems.length > 0) throw architectureError(proofProblems);
  return Object.freeze(proof);
}
