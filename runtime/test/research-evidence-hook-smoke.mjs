import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bindSession } from '../lib/sessions.mjs';
import { researchEvidence } from '../lib/hooks/research-evidence.mjs';
import { readAgentEvents } from '../lib/agent-evidence.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-research-evidence-'));
const changeId = 'research-change';
try {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({ schemaVersion: 5, changeId }));
  bindSession(root, {
    sessionId: 'research-session',
    changeId,
    worktreePath: root,
    controllerRevision: '0.4.0-dev',
  }, { commonDir: path.join(root, '.git') });

  const event = {
    tool_name: 'mcp__codegraph__codegraph_search',
    tool_input: { query: 'loadActiveChange' },
    session_id: 'research-session',
    agent_id: 'agent-research',
    tool_use_id: 'tool-research-1',
    cwd: root,
  };
  assert.deepEqual(researchEvidence({ root, event, success: true }), { exitCode: 0 });
  const [record] = readAgentEvents(root, changeId).filter((item) => item.kind === 'research-evidence');
  assert.equal(record.provider, 'codegraph');
  assert.equal(record.capability, 'codegraph_search');
  assert.equal(record.success, true);
  assert.equal(record.agentId, 'agent-research');
  assert.match(record.inputDigest, /^[a-f0-9]{64}$/u);

  researchEvidence({ root, event, success: true });
  assert.equal(readAgentEvents(root, changeId).filter((item) => item.kind === 'research-evidence').length, 1);
  console.log('PASS research-evidence-hook verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
