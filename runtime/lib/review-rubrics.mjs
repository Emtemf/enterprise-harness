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

export function canonicalReviewRubricProblems({ stage, behavior, rubricIds }) {
  if (!Array.isArray(rubricIds)) return [`canonical rubrics for ${behavior} must be an array`];
  let base;
  try {
    base = selectReviewRubrics({ stage, behavior });
  } catch (error) {
    return [error.message];
  }
  const selected = new Set(rubricIds);
  const inferredImpact = Object.fromEntries(
    IMPACT_RUBRICS.map(([key, rubric]) => [key, selected.has(rubric) ? 'yes' : 'no']),
  );
  const expected = selectReviewRubrics({ stage, behavior, impact: inferredImpact });
  if (JSON.stringify(rubricIds) !== JSON.stringify(expected)) {
    return [`canonical rubrics for ${behavior} must use ${base.join(', ')} family and canonical impact order`];
  }
  return [];
}
