const V6_STAGES = new Set(['clarify', 'design', 'plan', 'implement', 'verify', 'archive']);

export function agentForV2Handoff(stage, behavior, role) {
  if (role === 'check') return { type: 'enterprise-harness:reviewer', skill: 'review' };
  if (!V6_STAGES.has(stage)) throw new Error(`EH-HANDOFF-STAGE-001: unsupported v6 stage ${stage}`);
  if (stage === 'clarify' && /(^|\.)confirmed$/u.test(behavior)) {
    return { type: 'enterprise-harness:main', skill: 'harness' };
  }
  if (/(^|\.)explore-code$/u.test(behavior)) {
    return { type: 'enterprise-harness:code-explore', skill: 'explore-code' };
  }
  if (/(^|\.)research-docs$/u.test(behavior)) {
    return { type: 'enterprise-harness:doc-research', skill: 'research-docs' };
  }
  if (stage === 'implement') return { type: 'enterprise-harness:implementer', skill: 'implement' };
  return { type: 'enterprise-harness:artifact-worker', skill: stage };
}
