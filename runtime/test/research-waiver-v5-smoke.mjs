import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResearchPacket, validateResearchPacket } from '../lib/research-packet.mjs';
import { createWaiver, isWaiverFresh, validateWaiver } from '../lib/waiver.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-research-'));
try {
  const packet = createResearchPacket({
    question: 'Which state writer owns this change?',
    scope: 'runtime/lib',
    facts: [{ claim: 'state-store uses CAS', source: 'runtime/lib/state-store.mjs', confidence: 'high' }],
    uncertainties: ['worktree-local index freshness'],
    sourcePolicy: {
      primary: 'codegraph',
      fallbackUsed: true,
      degraded: true,
      status: 'degraded',
      fallbackReason: 'index is not worktree-local',
    },
    context: { headSha: 'abc123', libraryVersion: null },
    artifact: { path: 'requirements.md', digest: 'digest-a' },
  });
  assert.equal(validateResearchPacket(packet), true);
  assert.equal(packet.sourcePolicy.status, 'degraded');
  assert.throws(() => validateResearchPacket({ ...packet, sourcePolicy: { ...packet.sourcePolicy, status: 'unknown' } }), /EH-RESEARCH-PACKET-001/u);

  const waiver = createWaiver({
    rule: 'RESEARCH_CODEGRAPH_REQUIRED',
    scope: 'design',
    reason: 'CodeGraph index unavailable',
    approvedBy: 'user',
    artifact: { path: 'requirements.md', digest: 'digest-a' },
  });
  assert.equal(validateWaiver(waiver), true);
  assert.equal(isWaiverFresh(waiver, { path: 'requirements.md', digest: 'digest-a' }), true);
  assert.equal(isWaiverFresh(waiver, { path: 'requirements.md', digest: 'digest-b' }), false);
  assert.equal(isWaiverFresh(waiver, { path: 'design.md', digest: 'digest-a' }), false);
  console.log('PASS research-waiver-v5 verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
