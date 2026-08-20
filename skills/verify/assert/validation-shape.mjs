/**
 * Verify validation.md shape: heading, placeholder, required sections.
 * @param {string} content - validation.md raw content
 * @returns {{ id: string, verdict: 'pass'|'block', evidence: string[], findings: string[] }}
 */
export function assertValidationShape(content) {
  const problems = [];
  if (!content.startsWith('# Validation\n')) problems.push('validation.md must start with # Validation');
  if (/<[^>]+>/u.test(content)) problems.push('validation.md contains an unresolved placeholder');
  for (const heading of ['## Commands', '## Results', '## Freshness', '## Coverage and exceptions']) {
    if (!content.includes(heading)) problems.push(`validation.md is missing ${heading}`);
  }
  return {
    id: 'validation-shape',
    verdict: problems.length === 0 ? 'pass' : 'block',
    evidence: problems.length === 0 ? [] : ['harness/changes/<changeId>/validation.md'],
    findings: problems,
  };
}
