/**
 * Read a single hook event from stdin. All hooks receive a JSON payload on stdin;
 * this is the shared entry point so hook files stay thin and the JSON contract is
 * enforced in exactly one place.
 *
 * @param {string} errorCode - the hook's own input-error code for the message prefix
 * @returns {Promise<{ok: true, event: object} | {ok: false, error: string}>}
 */
export async function readHookEvent(errorCode = 'EH-HOOK-INPUT-017') {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return { ok: true, event: {} };
  try {
    return { ok: true, event: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `BLOCK [${errorCode}] invalid hook JSON: ${error.message}` };
  }
}

/**
 * Write a hook result to stdout/stderr and exit. All hooks that migrated to a
 * lib/*.mjs policy function return { exitCode, stdout?, stderr? }. A trailing
 * newline is appended only when the caller's string does not already end with one,
 * so exact-byte contracts (e.g. Stop's `{}\n` allow envelope) are preserved.
 */
export function runHookResult(result, code = null) {
  if (result.stdout) {
    process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
  }
  process.exit(result.exitCode ?? 0);
}
