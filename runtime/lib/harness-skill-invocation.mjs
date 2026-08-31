const FORK_SKILLS = new Set([
  'archive',
  'design',
  'explore-code',
  'implement',
  'plan',
  'research-docs',
  'review',
  'test-design',
  'verify',
]);

export function normalizeHarnessSkillName(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('enterprise-harness:')
    ? raw.slice('enterprise-harness:'.length)
    : raw;
}

export function isHarnessForkSkill(value) {
  return FORK_SKILLS.has(normalizeHarnessSkillName(value));
}
