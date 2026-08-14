const STAGE_RUBRICS = Object.freeze({
  clarify: ['requirements', 'classification'],
  design: ['design'],
  plan: ['plan'],
  implement: ['task'],
  verify: ['final'],
  archive: ['archive'],
});

const IMPACT_RUBRICS = Object.freeze([
  ['api', 'api'],
  ['data', 'data'],
  ['architecture', 'architecture'],
  ['rule', 'rule'],
  ['security', 'security'],
]);

export function selectReviewRubrics({ stage, impact = {} }) {
  const base = STAGE_RUBRICS[stage];
  if (!base) throw new Error(`unsupported review stage: ${stage}`);
  return [
    ...base,
    ...IMPACT_RUBRICS.filter(([key]) => impact[key] === 'yes').map(([, rubric]) => rubric),
  ];
}
