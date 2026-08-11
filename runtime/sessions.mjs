import process from 'node:process';
import { projectRoot } from './lib/checks.mjs';
import { bindSession, listSessions, readSession, sessionIdFromEnv, unbindSession } from './lib/sessions.mjs';

const root = projectRoot();
const [action, ...args] = process.argv.slice(2);

function assertSessionAuthority(sessionId) {
  const current = sessionIdFromEnv();
  const admin = process.env.ENTERPRISE_HARNESS_SESSION_ADMIN === 'true';
  if (!admin && (!current || current !== sessionId)) {
    throw new Error('EH-SESSION-AUTH-001: session administration requires the current session or explicit local admin mode');
  }
}

if (!action || action === '--help' || action === '-h') {
  console.log('Enterprise Harness Sessions');
  console.log('Usage: node runtime/sessions.mjs <bind|show|list|unbind> ...');
  process.exit(action ? 0 : 1);
}

try {
  if (action === 'bind') {
    const [sessionId, changeId, worktreePath = root, controllerRevision = '0.4.0-dev'] = args;
    assertSessionAuthority(sessionId);
    const binding = bindSession(root, { sessionId, changeId, worktreePath, controllerRevision });
    console.log(JSON.stringify(binding, null, 2));
  } else if (action === 'show') {
    const sessionId = args[0] || sessionIdFromEnv();
    if (sessionId) assertSessionAuthority(sessionId);
    const binding = sessionId ? readSession(root, sessionId) : null;
    if (!binding) process.exitCode = 1;
    else console.log(JSON.stringify(binding, null, 2));
  } else if (action === 'list') {
    const current = sessionIdFromEnv();
    assertSessionAuthority(current);
    const sessions = listSessions(root);
    const visible = process.env.ENTERPRISE_HARNESS_SESSION_ADMIN === 'true'
      ? sessions
      : sessions.filter((binding) => binding.sessionId === current);
    console.log(JSON.stringify(visible, null, 2));
  } else if (action === 'unbind') {
    const sessionId = args[0] || sessionIdFromEnv();
    if (sessionId) assertSessionAuthority(sessionId);
    if (!sessionId || !unbindSession(root, sessionId)) process.exitCode = 1;
  } else {
    console.error(`Unknown sessions action: ${action}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
