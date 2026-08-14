import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const schemas = [
  ['research-packet.schema.json', 'research-packet'],
  ['stage-result.schema.json', 'stage-result'],
  ['review-result.schema.json', 'review-result'],
  ['tecpc.schema.json', null],
  ['handoff-v2.schema.json', null],
];

for (const [name, type] of schemas) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'schemas', name), 'utf-8'));
  assert.equal(schema.type, 'object', `${name} must define an object`);
  assert.equal(schema.additionalProperties, false, `${name} must reject unknown fields`);
  if (type) assert.equal(schema.properties?.type?.const, type, `${name} must pin its type`);
}

console.log(`PASS result-schema ${mode}`);
