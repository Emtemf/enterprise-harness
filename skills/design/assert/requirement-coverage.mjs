function requirementIds(requirementsText) {
  return [...requirementsText.matchAll(/^##\s+(R[\w.-]+)/gmu)].map((match) => match[1]);
}

export function assertRequirementCoverage(requirementsText, designText, requirementsPath = 'requirements.md', designPath = 'design.md') {
  const ids = requirementIds(requirementsText);
  const missing = ids.filter((id) => !designText.includes(id));
  return {
    id: 'requirement-coverage',
    verdict: missing.length === 0 ? 'pass' : 'block',
    evidence: [requirementsPath, designPath],
    problems: ids.length === 0
      ? ['requirements contain no stable requirement identifiers']
      : missing.map((id) => `design does not cover ${id}`),
  };
}
