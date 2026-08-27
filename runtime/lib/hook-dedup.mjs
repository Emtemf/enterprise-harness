import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gitCommonDir } from './agent-evidence.mjs';

/**
 * Guard against duplicate hook execution. When the same tool_use_id triggers
 * this hook multiple times (e.g. plugin + settings.json both registered),
 * only the first invocation proceeds; subsequent ones exit immediately.
 *
 * Returns true if this is a duplicate call and the caller should exit(0).
 */
export function dedupGuard(kind, toolUseId, cwd) {
  if (!toolUseId) return false;
  return claimOnce(kind, toolUseId, cwd);
}

/**
 * Same guard for events that carry no tool_use_id (SessionStart, Stop). Each such
 * event fires once per registered channel, so `identity` must be whatever
 * distinguishes one event occurrence from the next — see stopEventIdentity for why
 * a bare session id is only correct for once-per-session events.
 *
 * Fails open when no identity is available — silencing a real run is worse than
 * printing twice.
 */
export function sessionDedupGuard(kind, identity, cwd) {
  if (!identity) return false;
  return claimOnce(kind, identity, cwd);
}

/**
 * SessionStart fires again on resume/clear/compact within one session, so the bare
 * session id would silence the harness context for the rest of the session after the
 * first startup. `source` separates those re-fires; the transcript stamp separates
 * repeats of the same source (a second /compact) and is absent on startup, when no
 * transcript exists yet.
 */
export function sessionStartEventIdentity(event) {
  if (!event?.session_id) return null;
  return `${event.session_id}:${event.source || 'startup'}:${transcriptStamp(event) || ''}`;
}

/**
 * Stop fires on every turn end, so the session id alone would silence the gate for
 * the whole session after the first stop. The transcript's size+mtime pins a single
 * stop occurrence: both channels observe the same value, and the next stop follows a
 * new assistant turn that has already grown the transcript. Returns null (fail open)
 * when the transcript is unreadable.
 */
export function stopEventIdentity(event) {
  if (!event?.session_id) return null;
  const stamp = transcriptStamp(event);
  if (!stamp) return null;
  return `${event.session_id}:${stamp}`;
}

export function userPromptEventIdentity(event) {
  if (!event?.session_id) return null;
  const stamp = transcriptStamp(event);
  if (!stamp) return null;
  return `${event.session_id}:${stamp}`;
}

function transcriptStamp(event) {
  const transcript = event?.transcript_path;
  if (!transcript) return null;
  const stat = fs.statSync(transcript, { throwIfNoEntry: false });
  return stat ? `${stat.size}:${stat.mtimeMs}` : null;
}

/**
 * Resolve the dedup marker directory. When the hook runs from the installed
 * plugin cache (not inside the project's git repo), `gitCommonDir` returns
 * `<cache>/.git` — a different path than the project's `.git`. Two processes
 * with different marker directories both pass the guard, causing doubled
 * output. Use `CLAUDE_PROJECT_DIR` (set by Claude Code for all hooks) to
 * anchor to the project root, ensuring both sources share one marker space.
 */
function dedupMarkerDir(cwd) {
  const anchor = process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd();
  return path.join(gitCommonDir(anchor), 'enterprise-harness', 'hook-dedup');
}

function claimOnce(kind, identity, cwd) {
  const dir = dedupMarkerDir(cwd);
  const key = crypto.createHash('sha256').update(`${kind}:${identity}`).digest('hex');
  const marker = path.join(dir, `${key}.lock`);
  fs.mkdirSync(dir, { recursive: true });
  // O_EXCL on the marker itself is the claim: exactly one concurrent caller can create
  // it. Staging a pid-named temp file and renaming would not work — rename overwrites,
  // so every racing channel would believe it won.
  try {
    fs.closeSync(fs.openSync(marker, 'wx'));
  } catch {
    return true; // another invocation already claimed this event
  }
  // Prune stale markers (>1h)
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.lock')) continue;
      const stat = fs.statSync(path.join(dir, f), { throwIfNoEntry: false });
      if (stat && now - stat.mtimeMs > 3_600_000) fs.rmSync(path.join(dir, f), { force: true });
    }
  } catch {}
  return false;
}
