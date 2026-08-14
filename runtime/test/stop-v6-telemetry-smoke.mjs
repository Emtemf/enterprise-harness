import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'runtime', 'lib', 'hooks', 'stop.mjs'), 'utf-8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'plugin', 'hooks-manifest.json'), 'utf-8'));
assert.match(source, /Stop is never a lifecycle correctness authority/u);
assert.doesNotMatch(source, /validateCompletionPredicate|validateCompletionReviewers/u);
assert.equal(manifest.hooks.Stop[0].failMode, 'fail-open');
assert.equal('TaskCompleted' in manifest.hooks, false);
assert.equal('SubagentStart' in manifest.hooks, false);
assert.equal('SubagentStop' in manifest.hooks, false);
console.log(`PASS stop-v6-telemetry ${mode}`);
