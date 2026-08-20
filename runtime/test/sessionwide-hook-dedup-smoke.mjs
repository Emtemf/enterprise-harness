import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// SessionStart / Stop carry no tool_use_id, so the tool_use_id-keyed dedupGuard never
// covered them. When the plugin manifest and .claude/settings.json both register the
// harness, the host fires each of these once per channel and the user sees the banner
// (and the Stop verdict) twice. Dedup for these events must key on session_id instead.

const sourceRoot = process.cwd();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-session-dedup-'));
  fs.mkdirSync(path.join(root, 'harness/changes'), { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: root, shell: false });
  return root;
}

function hook(root, script, payload, { cwd = root, env = {} } = {}) {
  return spawnSync('node', [path.join(sourceRoot, 'hooks/scripts', script)], {
    cwd,
    encoding: 'utf-8',
    input: JSON.stringify(payload),
    shell: false,
    env: { ...process.env, ...env },
  });
}

// SessionStart: the second channel must stay silent rather than reprint the banner.
{
  const root = fixture();
  const payload = { hook_event_name: 'SessionStart', session_id: 'session-dup-a', cwd: root };

  const first = hook(root, 'session-start.mjs', payload);
  assert.equal(first.status, 0, `first session-start must pass; stderr=${first.stderr}`);
  assert.match(first.stdout, /\[Harness 启动检查\]/, 'first session-start must print the banner');

  const second = hook(root, 'session-start.mjs', payload);
  assert.equal(second.status, 0, `duplicate session-start must pass; stderr=${second.stderr}`);
  assert.equal(
    second.stdout.trim(),
    '',
    'duplicate session-start must not reprint the banner for the same session',
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// A plugin hook can execute with a cache-directory cwd while a project-local hook
// executes with the project cwd. CLAUDE_PROJECT_DIR must keep both channels on the
// same marker space; otherwise each channel claims the same event independently.
{
  const root = fixture();
  const cacheCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-plugin-cache-cwd-'));
  const payload = {
    hook_event_name: 'SessionStart',
    session_id: 'session-cache-vs-project',
  };
  const env = { CLAUDE_PROJECT_DIR: root };

  const first = hook(root, 'session-start.mjs', payload, { cwd: cacheCwd, env });
  assert.equal(first.status, 0, `cache-cwd session-start must pass; stderr=${first.stderr}`);
  assert.match(first.stdout, /\[Harness 启动检查\]/);

  const second = hook(root, 'session-start.mjs', payload, { cwd: root, env });
  assert.equal(second.status, 0, `project-cwd duplicate must pass; stderr=${second.stderr}`);
  assert.equal(
    second.stdout.trim(),
    '',
    'plugin-cache and project-local channels must share the SessionStart dedup marker',
  );

  fs.rmSync(cacheCwd, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
}

// A different session in the same repo is not a duplicate.
{
  const root = fixture();
  const first = hook(root, 'session-start.mjs', {
    hook_event_name: 'SessionStart',
    session_id: 'session-one',
    cwd: root,
  });
  const other = hook(root, 'session-start.mjs', {
    hook_event_name: 'SessionStart',
    session_id: 'session-two',
    cwd: root,
  });
  assert.match(first.stdout, /\[Harness 启动检查\]/);
  assert.match(other.stdout, /\[Harness 启动检查\]/, 'a distinct session must still get its banner');
  fs.rmSync(root, { recursive: true, force: true });
}

// SessionStart fires again on resume/clear/compact within the same session_id, so the
// bare session id is not the event identity — keying on it alone silences the harness
// context for the rest of the session after the first startup.
{
  const root = fixture();
  const startup = hook(root, 'session-start.mjs', {
    hook_event_name: 'SessionStart',
    session_id: 'session-multi-source',
    source: 'startup',
    cwd: root,
  });
  assert.match(startup.stdout, /\[Harness 启动检查\]/);

  for (const source of ['resume', 'clear', 'compact']) {
    const again = hook(root, 'session-start.mjs', {
      hook_event_name: 'SessionStart',
      session_id: 'session-multi-source',
      source,
      cwd: root,
    });
    assert.match(
      again.stdout,
      /\[Harness 启动检查\]/,
      `SessionStart source=${source} is a distinct event and must still inject the banner`,
    );
    // ...but its own duplicate channel must still be deduped.
    const dup = hook(root, 'session-start.mjs', {
      hook_event_name: 'SessionStart',
      session_id: 'session-multi-source',
      source,
      cwd: root,
    });
    assert.equal(
      dup.stdout.trim(),
      '',
      `the second channel of source=${source} must not reprint the banner`,
    );
  }
  fs.rmSync(root, { recursive: true, force: true });
}

// The same source can repeat (a second /compact). The transcript stamp separates those
// occurrences the way it does for Stop, so the later one is not swallowed by the marker.
{
  const root = fixture();
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcript, 'turn-one\n');
  const payload = {
    hook_event_name: 'SessionStart',
    session_id: 'session-repeat-compact',
    source: 'compact',
    transcript_path: transcript,
    cwd: root,
  };

  assert.match(hook(root, 'session-start.mjs', payload).stdout, /\[Harness 启动检查\]/);
  assert.equal(
    hook(root, 'session-start.mjs', payload).stdout.trim(),
    '',
    'the second channel of one compact must not reprint the banner',
  );

  fs.appendFileSync(transcript, 'turn-two\n');
  assert.match(
    hook(root, 'session-start.mjs', payload).stdout,
    /\[Harness 启动检查\]/,
    'a later compact in the same session must not be swallowed by the dedup marker',
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// Stop: the duplicate must still emit the {} allow envelope — swallowing stdout entirely
// would trip the host's "JSON validation failed" check — but must not repeat the guidance.
{
  const root = fixture();
  const transcript = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(transcript, 'turn-one\n');
  const payload = {
    hook_event_name: 'Stop',
    session_id: 'session-dup-b',
    transcript_path: transcript,
    cwd: root,
  };

  const first = hook(root, 'stop.mjs', payload);
  assert.equal(first.status, 0, `first stop must allow; stderr=${first.stderr}`);
  assert.equal(first.stdout.trim(), '{}');
  assert.match(first.stderr, /Stop handoff guidance/, 'first stop must print handoff guidance');

  const second = hook(root, 'stop.mjs', payload);
  assert.equal(second.status, 0, `duplicate stop must allow; stderr=${second.stderr}`);
  assert.equal(second.stdout.trim(), '{}', 'duplicate stop must still satisfy the Stop stdout contract');
  assert.equal(second.stderr.trim(), '', 'duplicate stop must not repeat the handoff guidance');

  // The next turn grows the transcript, so the gate must run again rather than stay
  // silenced for the rest of the session.
  fs.appendFileSync(transcript, 'turn-two\n');
  const nextTurn = hook(root, 'stop.mjs', payload);
  assert.equal(nextTurn.status, 0, `next stop must allow; stderr=${nextTurn.stderr}`);
  assert.match(
    nextTurn.stderr,
    /Stop handoff guidance/,
    'a later stop in the same session must not be swallowed by the dedup marker',
  );

  fs.rmSync(root, { recursive: true, force: true });
}

// Stop without a readable transcript must fail open: the gate is a blocker, so
// silencing it on missing metadata would let an unvalidated change end the session.
{
  const root = fixture();
  const payload = { hook_event_name: 'Stop', session_id: 'session-no-transcript', cwd: root };
  const first = hook(root, 'stop.mjs', payload);
  const second = hook(root, 'stop.mjs', payload);
  assert.match(first.stderr, /Stop handoff guidance/);
  assert.match(
    second.stderr,
    /Stop handoff guidance/,
    'without a transcript path the stop gate must still run',
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// Missing session_id must not collapse unrelated invocations into one another.
{
  const root = fixture();
  const first = hook(root, 'session-start.mjs', { hook_event_name: 'SessionStart', cwd: root });
  const second = hook(root, 'session-start.mjs', { hook_event_name: 'SessionStart', cwd: root });
  assert.match(first.stdout, /\[Harness 启动检查\]/);
  assert.match(
    second.stdout,
    /\[Harness 启动检查\]/,
    'without a session_id the guard must fail open rather than silence real runs',
  );
  fs.rmSync(root, { recursive: true, force: true });
}

// Both channels fire concurrently, not in sequence. A claim that stages a pid-named
// temp file and renames it onto the marker looks atomic but is not — rename overwrites,
// so several racing callers all believe they won and the banner still prints twice.
//
// Every hook blocks on stdin before doing anything, so spawning all of them first and
// releasing stdin together is what makes the claim windows actually overlap; feeding
// stdin at spawn time lets node's startup cost serialize them and the race hides.
{
  const root = fixture();
  const payload = JSON.stringify({
    hook_event_name: 'SessionStart',
    session_id: 'session-race',
    cwd: root,
  });
  const script = path.join(sourceRoot, 'hooks/scripts/session-start.mjs');
  const children = Array.from({ length: 8 }, () => spawn('node', [script], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  }));
  const outputs = children.map((child) => new Promise((resolve) => {
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', () => resolve(stdout));
  }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const child of children) child.stdin.end(payload);

  const runs = await Promise.all(outputs);
  const printed = runs.filter((out) => out.includes('[Harness 启动检查]')).length;
  assert.equal(printed, 1, `exactly one concurrent claimant may print the banner; got ${printed}/8`);
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`PASS sessionwide-hook-dedup ${process.argv[2] || 'verify'}`);
