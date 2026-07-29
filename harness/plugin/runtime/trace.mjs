import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { activeChangeId, readAgentEvents } from './lib/agent-evidence.mjs';
import { runDir } from './lib/handoff.mjs';

const root = projectRoot();
const [runId, changeArg] = process.argv.slice(2);
const changeId = changeArg || activeChangeId(root);
if (!runId || !changeId) {
  console.error('Usage: enterprise-harness trace <run-id> [change-id]');
  process.exit(1);
}

const dir = runDir(root, changeId, runId);
const events = readAgentEvents(root, changeId).filter((event) => event.runId === runId);
if (!fs.existsSync(dir) && events.length === 0) {
  console.error(`Unknown run: ${runId}`);
  process.exit(1);
}

console.log(`Enterprise Harness Trace: ${runId}`);
console.log(`changeId: ${changeId}`);
console.log(`runDir: ${path.relative(root, dir)}`);
if (fs.existsSync(dir)) {
  console.log('artifacts:');
  for (const file of fs.readdirSync(dir).sort()) console.log(`- ${file}`);
}
console.log('events:');
for (const event of events) {
  const detail = event.errorCode || event.verdict || event.violation || '';
  console.log(`- ${event.issuedAt} ${event.kind} agent=${event.agentId || '-'} ${detail}`.trim());
}
process.exit(0);
