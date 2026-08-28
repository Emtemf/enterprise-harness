function acceptanceSection(requirementsText) {
  return requirementsText.match(/^###\s+验收\s*$([\s\S]*?)(?=^#{2,3}\s+|(?![\s\S]))/mu)?.[1] ?? '';
}

export function requirementIds(requirementsText) {
  return [...acceptanceSection(requirementsText).matchAll(/^\s*-\s+(R[0-9][\w.-]*)\s*[：:]/gmu)]
    .map((match) => match[1]);
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
