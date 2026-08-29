import fs from 'node:fs';
import { readClassificationArtifact } from '../core/classification-artifact.mjs';
import { statePathFor, validateV6State } from '../core/change-state.mjs';

const STAGE_RUBRICS = Object.freeze({
  clarify: ['requirements', 'classification'],
  plan: ['plan'],
  implement: ['task'],
  verify: ['final'],
  archive: ['archive'],
});

const DESIGN_BEHAVIOR_RUBRICS = Object.freeze({
  'design.produce': ['design'],
  'design.review': ['design'],
  'design.test-cases': ['test-design'],
  'design.test-cases.review': ['test-design'],
});

const DESIGN_EXECUTION_REVIEW_BEHAVIORS = Object.freeze({
  'design.produce': 'design.review',
  'design.test-cases': 'design.test-cases.review',
});

const IMPACT_RUBRICS = Object.freeze([
  ['api', 'api'],
  ['data', 'data'],
  ['architecture', 'architecture'],
  ['rule', 'rule'],
  ['security', 'security'],
]);

export function selectReviewRubrics({ stage, behavior, impact = {} }) {
  const base = stage === 'design' ? DESIGN_BEHAVIOR_RUBRICS[behavior] : STAGE_RUBRICS[stage];
  if (stage === 'design' && !behavior) throw new Error('review behavior is required for design');
  if (stage === 'design' && !base) throw new Error(`unsupported design review behavior: ${behavior}`);
  if (!base) throw new Error(`unsupported review stage: ${stage}`);
  return [
    ...base,
    ...IMPACT_RUBRICS.filter(([key]) => impact[key] === 'yes').map(([, rubric]) => rubric),
  ];
}

export function designReviewBehaviorFor(executionBehavior) {
  const behavior = DESIGN_EXECUTION_REVIEW_BEHAVIORS[executionBehavior];
  if (!behavior) throw new Error(`unsupported design execution behavior: ${executionBehavior}`);
  return behavior;
}

function authoritativeImpact(root, changeId) {
  if (!root || !changeId) throw new Error('classification authority requires root and changeId');
  const statePath = statePathFor(root, changeId);
  if (!fs.existsSync(statePath)) throw new Error(`classification authority state is missing: ${statePath}`);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch (error) {
    throw new Error(`classification authority state is malformed: ${error.message}`);
  }
  const stateProblems = validateV6State(state, changeId);
  if (stateProblems.length > 0) {
    throw new Error(`classification authority State v6 is invalid: ${stateProblems.join('; ')}`);
  }
  return readClassificationArtifact(root, changeId, state.artifacts.classification).impact;
}

export function canonicalReviewRubricProblems({ root, changeId, stage, behavior, rubricIds }) {
  if (!Array.isArray(rubricIds)) return [`canonical rubrics for ${behavior} must be an array`];
  let expected;
  try {
    const impact = stage === 'design' ? authoritativeImpact(root, changeId) : {};
    expected = selectReviewRubrics({ stage, behavior, impact });
  } catch (error) {
    return [`classification authority for ${behavior} is invalid: ${error.message}`];
  }
  if (JSON.stringify(rubricIds) !== JSON.stringify(expected)) {
    return [`canonical rubrics for ${behavior} must exactly equal authority-derived ${expected.join(', ')}`];
  }
  return [];
}
