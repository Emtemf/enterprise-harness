const SOURCE_LANES = new Set(['codegraph', 'context7', 'mixed']);
const STATUSES = new Set(['ok', 'fallback', 'degraded', 'block']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function createResearchPacket(input = {}) {
  const packet = {
    schemaVersion: 1,
    question: String(input.question || '').trim(),
    scope: String(input.scope || '').trim(),
    facts: Array.isArray(input.facts) ? input.facts.map((fact) => ({
      claim: String(fact.claim || '').trim(),
      source: String(fact.source || '').trim(),
      confidence: fact.confidence || 'medium',
    })) : [],
    uncertainties: Array.isArray(input.uncertainties) ? [...input.uncertainties] : [],
    sourcePolicy: {
      primary: input.sourcePolicy?.primary || 'mixed',
      fallbackUsed: input.sourcePolicy?.fallbackUsed === true,
      degraded: input.sourcePolicy?.degraded === true,
      status: input.sourcePolicy?.status || (input.sourcePolicy?.degraded ? 'degraded' : 'ok'),
      fallbackReason: input.sourcePolicy?.fallbackReason || null,
    },
    context: {
      headSha: input.context?.headSha || null,
      libraryVersion: input.context?.libraryVersion || null,
    },
    artifact: input.artifact ? {
      path: String(input.artifact.path || ''),
      digest: String(input.artifact.digest || ''),
    } : null,
    createdAt: input.createdAt || new Date().toISOString(),
  };
  validateResearchPacket(packet);
  return Object.freeze(packet);
}

export function validateResearchPacket(packet) {
  assert(packet && typeof packet === 'object', 'EH-RESEARCH-PACKET-001: packet must be an object');
  assert(packet.schemaVersion === 1, 'EH-RESEARCH-PACKET-001: unsupported packet schemaVersion');
  assert(packet.question.length > 0, 'EH-RESEARCH-PACKET-001: question is required');
  assert(packet.scope.length > 0, 'EH-RESEARCH-PACKET-001: scope is required');
  assert(Array.isArray(packet.facts), 'EH-RESEARCH-PACKET-001: facts must be an array');
  for (const fact of packet.facts) {
    assert(fact.claim && fact.source && CONFIDENCE.has(fact.confidence), 'EH-RESEARCH-PACKET-001: invalid fact');
  }
  assert(SOURCE_LANES.has(packet.sourcePolicy?.primary), 'EH-RESEARCH-PACKET-001: invalid source lane');
  assert(STATUSES.has(packet.sourcePolicy?.status), 'EH-RESEARCH-PACKET-001: invalid source status');
  if (packet.sourcePolicy.status === 'fallback' || packet.sourcePolicy.status === 'degraded') {
    assert(packet.sourcePolicy.fallbackUsed === true, 'EH-RESEARCH-PACKET-001: fallback status requires fallbackUsed');
    assert(packet.sourcePolicy.fallbackReason, 'EH-RESEARCH-PACKET-001: fallback status requires fallbackReason');
  }
  if (packet.artifact !== null) {
    assert(packet.artifact?.path && packet.artifact?.digest, 'EH-RESEARCH-PACKET-001: artifact binding is incomplete');
  }
  return true;
}
