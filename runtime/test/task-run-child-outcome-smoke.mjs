import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'runtime', 'task-run.mjs'), 'utf-8');

assert.match(source, /const childOutcome = parseTaskChildOutcome\(child\.output\?\.\[3\]\)/u);
assert.match(source, /if \(childOutcome\.kind === 'spawn-error'\) \{/u);
assert.match(source, /if \(childOutcome\.kind === 'signal'\) \{/u);
assert.match(source, /throw new Error\(`task command spawn failed: \$\{childOutcome\.spawnError\}`\);/u);
assert.match(source, /throw new Error\(`task command terminated by signal: \$\{childOutcome\.signal\}`\);/u);
assert.match(source, /outcome: childOutcome\.kind/u);
assert.match(source, /exitCode: childOutcome\.exitCode/u);
assert.match(source, /signal: childOutcome\.signal/u);
assert.match(source, /spawnError: childOutcome\.spawnError/u);
assert.doesNotMatch(source, /const expectedChildStatus = childOutcome\.kind === 'exit' \? childOutcome\.exitCode : 2;/u);

console.log(`PASS task-run-child-outcome ${mode}`);
