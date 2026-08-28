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
