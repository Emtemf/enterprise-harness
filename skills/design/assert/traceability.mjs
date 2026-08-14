function requirementIds(requirementsText) {
  return [...requirementsText.matchAll(/^##\s+(R[\w.-]+)/gmu)].map((match) => match[1]);
}

export function assertTraceability(requirementsText, designText, requirementsPath = 'requirements.md', designPath = 'design.md') {
  const ids = requirementIds(requirementsText);
  const hasDecisionEvidence = /决策与证据[\s\S]*?(?:decision|决策)[\s\S]*?(?:evidence|证据)/u.test(designText);
  const missing = ids.filter((id) => !designText.includes(id));
  const problems = [
    ...missing.map((id) => `missing requirement trace: ${id}`),
    ...(hasDecisionEvidence ? [] : ['design has no decision-to-evidence trace']),
  ];
  return {
    id: 'traceability',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: [requirementsPath, designPath],
    problems,
  };
}
