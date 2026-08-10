import { postWrite } from '../lib/hooks/post-write.mjs';
import { projectRoot } from '../lib/checks.mjs';

// Thin hook: read stdin, delegate to lib/hooks/post-write.mjs (stale invalidation
// + Bash attribution + TECPC card), print result, exit. All policy lives in the lib.

const root = projectRoot();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();

const result = postWrite({ root, raw });
if (result.stdout) process.stdout.write(`${result.stdout}\n`);
if (result.stderr) process.stderr.write(`${result.stderr}\n`);
process.exit(result.exitCode);
