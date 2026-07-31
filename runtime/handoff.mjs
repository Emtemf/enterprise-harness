import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { activeChangeId } from './lib/agent-evidence.mjs';
import {
  createHandoffInput,
  loadHandoffInput,
  runDir,
  validateHandoffResult,
} from './lib/handoff.mjs';
import { diagnostic, DIAGNOSTICS } from './lib/diagnostics.mjs';

const root = projectRoot();
const [action, ...args] = process.argv.slice(2);

function help() {
  console.log('Enterprise Harness Handoff');
  console.log('Usage: enterprise-harness handoff <create|validate|show|explain> ...');
  console.log('  create <change-id> <stage> <behavior> <execute|check> [parent-run-id] [--input-ref <path>] [--target <text>]');
  console.log('  validate <input-path> [result-path]');
  console.log('  show <change-id> <run-id>');
  console.log('  explain <error-code>');
}

if (!action || action === '--help' || action === '-h') {
  help();
  process.exit(0);
}

if (action === 'create') {
  const positional = [];
  const inputRefs = [];
  let target = '';
  let pathSummary = '';
  let correction = '';
  let attempt = 1;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--input-ref') inputRefs.push(args[++index]);
    else if (value === '--target') target = args[++index] || '';
    else if (value === '--path') pathSummary = args[++index] || '';
    else if (value === '--correction') correction = args[++index] || '';
    else if (value === '--attempt') attempt = Number(args[++index] || 1);
    else positional.push(value);
  }
  const [changeId = activeChangeId(root), stage, behavior, role = 'execute', parentRunId = null] = positional;
  if (!changeId || !stage || !behavior) {
    console.error('Usage: handoff create <change-id> <stage> <behavior> <execute|check> [parent-run-id] [--input-ref <path>]');
    process.exit(1);
  }
  try {
    const created = createHandoffInput(root, {
      changeId,
      stage,
      behavior,
      role,
      parentRunId: parentRunId || null,
      inputRefs,
      target: target || behavior,
      context: inputRefs,
      pathSummary: pathSummary || `${role} ${behavior}`,
      correction: correction || 'return blocker with an EH-* code and recovery action',
      attempt,
    });
    console.log(`HANDOFF_INPUT=${path.relative(root, created.path)}`);
    console.log(`runId=${created.envelope.runId}`);
    console.log(`agent=${created.envelope.agent.type}`);
    console.log(`skill=${created.envelope.agent.skill}`);
    process.exit(0);
  } catch (error) {
    console.error(`BLOCK [EH-HANDOFF-SCHEMA-002] ${error.message}`);
    process.exit(2);
  }
}

if (action === 'validate') {
  const [inputPath, resultPath] = args;
  const loaded = loadHandoffInput(root, inputPath);
  const problems = [...(loaded.problems || [])];
  if (loaded.ok && resultPath) {
    try {
      const result = JSON.parse(fs.readFileSync(path.resolve(root, resultPath), 'utf-8'));
      problems.push(...validateHandoffResult(result, loaded.envelope));
    } catch (error) {
      problems.push(`invalid result JSON: ${error.message}`);
    }
  }
  if (problems.length) {
    console.error(`BLOCK [EH-HANDOFF-SCHEMA-002] ${problems.join('; ')}`);
    process.exit(2);
  }
  console.log('PASS handoff contract');
  process.exit(0);
}

if (action === 'show') {
  const [changeId, runId] = args;
  const dir = runDir(root, changeId, runId);
  if (!fs.existsSync(dir)) {
    console.error(`Unknown run: ${runId}`);
    process.exit(1);
  }
  for (const file of fs.readdirSync(dir).sort()) console.log(path.join(dir, file));
  process.exit(0);
}

if (action === 'explain') {
  const code = args[0];
  const item = diagnostic(code);
  if (!item) {
    console.error(`Unknown diagnostic code: ${code}`);
    console.error(`Known codes: ${Object.keys(DIAGNOSTICS).join(', ')}`);
    process.exit(1);
  }
  console.log(`${code}: ${item.summary}`);
  console.log(`Recovery: ${item.recovery}`);
  process.exit(0);
}

console.error(`Unknown handoff action: ${action}`);
help();
process.exit(1);
