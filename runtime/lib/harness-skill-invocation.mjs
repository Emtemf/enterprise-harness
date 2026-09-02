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

const SKILL_AGENT_TYPES = Object.freeze({
  archive: 'enterprise-harness:artifact-worker',
  design: 'enterprise-harness:artifact-worker',
  'explore-code': 'enterprise-harness:code-explore',
  implement: 'enterprise-harness:implementer',
  plan: 'enterprise-harness:artifact-worker',
  'research-docs': 'enterprise-harness:doc-research',
  review: 'enterprise-harness:reviewer',
  'test-design': 'enterprise-harness:artifact-worker',
  verify: 'enterprise-harness:artifact-worker',
});

export function normalizeHarnessSkillName(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('enterprise-harness:')
    ? raw.slice('enterprise-harness:'.length)
    : raw;
}

export function isHarnessForkSkill(value) {
  return FORK_SKILLS.has(normalizeHarnessSkillName(value));
}

export function harnessForkSkillAgentType(value) {
  return SKILL_AGENT_TYPES[normalizeHarnessSkillName(value)] || null;
}
