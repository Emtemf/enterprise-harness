// Runtime public API: Architecture Design proof.
// Skills may only import from runtime/api/*; runtime/core and runtime/lib are internal.

import {
  buildDesignArchitectureProof,
  readDesignArchitectureProof,
  sameDesignArchitectureProofBinding,
  validateDesignArchitectureProof,
} from '../core/design-proof.mjs';
import { completionChainForBehavior } from '../lib/stage-results.mjs';

export function validateCanonicalDesignArchitectureBinding(root, changeId, proof = null) {
  const problems = [];
  let architectureProof = proof;
  if (!architectureProof) {
    try {
      architectureProof = readDesignArchitectureProof(root, changeId);
    } catch (error) {
      return [error.message];
    }
  }
  problems.push(...validateDesignArchitectureProof(root, architectureProof));
  if (architectureProof?.changeId !== changeId) {
    problems.push(`architecture proof changeId must be ${changeId}`);
  }

  const designRef = `harness/changes/${changeId}/design.md`;
  const chain = completionChainForBehavior(root, changeId, 'design.produce', [designRef]);
  problems.push(...chain.problems);
  if (problems.length > 0) return problems;

  let canonical;
  try {
    canonical = buildDesignArchitectureProof(root, chain.stageResult, chain.reviewResult);
  } catch (error) {
    return [error.message];
  }
  if (!sameDesignArchitectureProofBinding(architectureProof, canonical)) {
    problems.push('canonical architecture binding does not match the exact design.produce execute/review chain');
  }
  return problems;
}

export {
  designArchitectureProofRef,
  readDesignArchitectureProof,
} from '../core/design-proof.mjs';
