import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { activeChangeId, readAgentEvents } from './lib/agent-evidence.mjs';
import { runDir } from './lib/handoff.mjs';

const root = projectRoot();
const args = process.argv.slice(2);
const mermaid = args.includes('--mermaid');
const changeIdx = args.indexOf('--change');
const changeFromFlag = changeIdx !== -1 ? args[changeIdx + 1] : null;
const positional = args.filter((a, i) => a !== '--mermaid' && i !== changeIdx + 1 && a !== args[changeIdx]);
const runId = positional[0];
const changeId = changeFromFlag || positional[1] || (!runId ? activeChangeId(root) : null);

if (mermaid) {
  if (!changeId) {
    console.error('Usage: enterprise-harness trace --change <change-id> --mermaid');
    process.exit(1);
  }
  const events = readAgentEvents(root, changeId);
  console.log(renderMermaid(changeId, events));
  process.exit(0);
}

if (!runId || !changeId) {
  console.error('Usage: enterprise-harness trace <run-id> [change-id]');
  console.error('       enterprise-harness trace --change <change-id> --mermaid');
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

function renderMermaid(changeId, events) {
  if (events.length === 0) return `sequenceDiagram\n  note over Orchestrator: No events recorded for ${changeId}`;

  const agents = new Set();
  for (const e of events) {
    if (e.agentId) agents.add(e.agentId);
  }

  const lines = ['sequenceDiagram', `  title Change: ${changeId}`, ''];
  lines.push('  participant Orchestrator');
  for (const id of agents) {
    lines.push(`  participant ${sanitize(id)}`);
  }
  lines.push('');

  let currentRun = null;
  let groupOpen = false;
  for (const event of events) {
    if (event.runId && event.runId !== currentRun) {
      if (groupOpen) lines.push('  end');
      currentRun = event.runId;
      lines.push(`  group run ${currentRun}`);
      groupOpen = true;
    }
    const agent = event.agentId ? sanitize(event.agentId) : 'Orchestrator';
    const time = event.issuedAt ? new Date(event.issuedAt).toISOString().slice(11, 19) : '';
    switch (event.kind) {
      case 'dispatch':
        lines.push(`    Orchestrator->>${agent}: dispatch (${event.behavior || '?'})`);
        break;
      case 'dispatch-binding':
        lines.push(`    note over ${agent}: bound to run ${event.runId || '-'}`);
        break;
      case 'start':
        lines.push(`    ${agent}->>Orchestrator: start ${time}`);
        break;
      case 'stop': {
        const detail = event.verdict || event.errorCode || '';
        lines.push(`    ${agent}->>Orchestrator: stop ${detail ? `(${detail})` : ''} ${time}`);
        break;
      }
      case 'failure':
        lines.push(`    ${agent}--xOrchestrator: FAIL ${event.errorCode || ''} ${time}`);
        break;
      case 'violation':
        lines.push(`    note over ${agent}: violation ${event.violation || ''} ${time}`);
        break;
      case 'codegraph-attempt':
        lines.push(`    note over ${agent}: codegraph attempt ${time}`);
        break;
      default:
        lines.push(`    note over ${agent}: ${event.kind} ${time}`);
    }
  }
  if (groupOpen) lines.push('  end');
  return lines.join('\n');
}

function sanitize(id) {
  return id.replace(/[^A-Za-z0-9_-]/gu, '_').replace(/^(-*\d)/u, '_$1');
}
