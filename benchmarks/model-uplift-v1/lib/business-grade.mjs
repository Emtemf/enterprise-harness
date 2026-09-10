export function gradeBusinessClarification(selectedCase, transcript, finalRequirements, { productCodeChanged = false } = {}) {
  const facts = selectedCase.requiredFacts;
  const answered = new Set(transcript.flatMap((turn) => turn.answeredFactIds || []));
  const totalWeight = facts.reduce((sum, fact) => sum + fact.weight, 0);
  const discoveredWeight = facts.filter((fact) => answered.has(fact.id)).reduce((sum, fact) => sum + fact.weight, 0);
  const finalCoverage = facts.map((fact) => ({
    factId: fact.id,
    covered: new RegExp(fact.acceptancePattern, 'iu').test(String(finalRequirements || '')),
    weight: fact.weight,
  }));
  const coveredWeight = finalCoverage.filter(({ covered }) => covered).reduce((sum, item) => sum + item.weight, 0);
  const prematureFactIds = finalCoverage.filter(({ factId, covered }) => covered && !answered.has(factId)).map(({ factId }) => factId);
  const evidenceRefs = Object.keys(selectedCase.evidenceFiles || {});
  const groundedEvidenceRefs = evidenceRefs.filter((reference) => String(finalRequirements || '').includes(reference));
  const unmatchedQuestions = transcript.filter(({ unmatched }) => unmatched).length;
  const questionTurns = transcript.length;
  const criticalUnknownRecall = totalWeight === 0 ? 0 : discoveredWeight / totalWeight;
  const finalRequirementCoverage = totalWeight === 0 ? 0 : coveredWeight / totalWeight;
  const prematureAssumptionRate = facts.length === 0 ? 0 : prematureFactIds.length / facts.length;
  const evidenceGroundingRate = evidenceRefs.length === 0 ? 1 : groundedEvidenceRefs.length / evidenceRefs.length;
  const decisionEfficiency = questionTurns === 0 ? 0 : discoveredWeight / questionTurns;
  const effectScore = 100 * (
    0.35 * criticalUnknownRecall
    + 0.35 * finalRequirementCoverage
    + 0.15 * (1 - prematureAssumptionRate)
    + 0.15 * evidenceGroundingRate
  );
  const accepted = criticalUnknownRecall === 1 && finalRequirementCoverage === 1
    && prematureAssumptionRate === 0 && evidenceGroundingRate === 1
    && unmatchedQuestions === 0 && !productCodeChanged;
  return {
    accepted,
    effectScore,
    criticalUnknownRecall,
    finalRequirementCoverage,
    prematureAssumptionRate,
    evidenceGroundingRate,
    decisionEfficiency,
    questionTurns,
    unmatchedQuestions,
    productCodeChanged,
    answeredFactIds: [...answered].sort(),
    missingFactIds: facts.filter((fact) => !answered.has(fact.id)).map(({ id }) => id),
    prematureFactIds,
    groundedEvidenceRefs,
    missingEvidenceRefs: evidenceRefs.filter((reference) => !groundedEvidenceRefs.includes(reference)),
    finalCoverage,
  };
}
