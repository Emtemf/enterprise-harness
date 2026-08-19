import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { planCacheCleanup } from '../lib/plugin-cache.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheRoot = '/fake/cache/root';
const keepPath = path.join(cacheRoot, '0.5.2');
const versions = ['0.3.14', '0.5.1', '0.5.2'];

const retained = planCacheCleanup(versions, cacheRoot, keepPath);
assert.deepEqual(retained.remove, []);
assert.deepEqual(retained.retain.map(({ version }) => version), ['0.3.14', '0.5.1']);

const pruned = planCacheCleanup(versions, cacheRoot, keepPath, { pruneOld: true });
assert.deepEqual(pruned.retain, []);
assert.deepEqual(pruned.remove.map(({ version }) => version), ['0.3.14', '0.5.1']);
assert.equal(pruned.remove.some(({ version }) => version === '0.5.2'), false);

const source = fs.readFileSync(path.join(root, 'runtime', 'update-local.mjs'), 'utf-8');
assert.match(source, /--prune-old/u);
assert.match(source, /planCacheCleanup/u);
assert.match(source, /after\.error/u);
assert.match(source, /更新后无法复核/u);
assert.match(source, /保留旧缓存/u);
assert.match(source, /reload-plugins/u);

console.log(`PASS update-local-cache-retention ${mode}`);
