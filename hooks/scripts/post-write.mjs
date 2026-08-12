import { postWrite } from '../../runtime/lib/hooks/post-write.mjs';
import { projectRoot } from '../../runtime/lib/checks.mjs';

// Thin hook: read stdin, delegate to lib/hooks/post-write.mjs (stale invalidation
// + Bash attribution + TECPC card), print result, exit. All policy lives in the lib.

const root = projectRoot();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
let event = null;
try {
  event = raw ? JSON.parse(raw) : null;
} catch {
  event = null;
}

const result = postWrite({ root, raw, event });
if (result.stdout) process.stdout.write(`${result.stdout}\n`);
if (result.stderr) process.stderr.write(`${result.stderr}\n`);
process.exit(result.exitCode);
