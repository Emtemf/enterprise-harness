import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const currentDocs = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/user/quickstart.md',
  'docs/user/workflow.md',
  'docs/user/troubleshooting.md',
  'docs/user/limitations.md',
  'docs/maintainer/architecture.md',
  'docs/maintainer/hooks.md',
  'docs/maintainer/state-and-evidence.md',
  'docs/maintainer/testing.md',
  'docs/maintainer/packaging.md',
  'docs/maintainer/release.md',
  'harness/specs/README.md',
  'harness/specs/architecture.md',
  'harness/specs/workflow.md',
  'harness/specs/state-schema.md',
  'harness/specs/agents-and-handoff.md',
  'harness/specs/hooks.md',
  'harness/specs/evidence.md',
  'harness/specs/testing.md',
  'harness/specs/distribution-and-release.md',
];
for (const file of currentDocs) assert.ok(fs.existsSync(path.join(root, file)), `missing current document ${file}`);

assert.ok(read('README.md').split(/\r?\n/u).length <= 160, 'README must remain at most 160 lines');
assert.ok(read('CLAUDE.md').split(/\r?\n/u).length <= 110, 'CLAUDE.md must remain at most 110 lines');
assert.ok(read('AGENTS.md').split(/\r?\n/u).length <= 100, 'AGENTS.md must remain at most 100 lines');

const corpus = currentDocs.map((file) => `${file}\n${read(file)}`).join('\n');
assert.match(corpus, /\/enterprise-harness:harness/u);
assert.match(corpus, /本仓库开发[\s\S]*\/harness/u);
assert.doesNotMatch(corpus, /standalone/iu);
assert.doesNotMatch(corpus, /harness\/explorations/u);
assert.doesNotMatch(corpus, /docs\/zh-cn/u);
assert.doesNotMatch(corpus, /PROGRESS\.md/u);
for (const token of ['七维', 'ambiguity', 'executor', 'checker', 'receipt', 'completion']) {
  assert.ok(corpus.toLowerCase().includes(token.toLowerCase()), `current docs missing ${token}`);
}
console.log('PASS current-doc-surface verify');
