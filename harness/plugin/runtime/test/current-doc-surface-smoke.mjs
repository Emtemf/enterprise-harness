import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const files = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/zh-cn/installation-guide.md', 'docs/zh-cn/overview.md', 'harness/specs/staged-workflow.md', 'harness/specs/plugin-runtime.md', 'harness/specs/tdd-execution.md', 'harness/specs/directory-model.md', 'harness/specs/release-readiness.md'];
const corpus = files.map((file) => `${file}\n${fs.readFileSync(path.join(root, file), 'utf-8')}`).join('\n');
assert.match(corpus, /plugin install[\s\S]*\/enterprise-harness:harness/u);
assert.match(corpus, /standalone[\s\S]*\/harness/u);
assert.doesNotMatch(corpus, /安装(?:插件|后)[^\n]{0,80}(?:从|入口)[^\n]{0,40}`\/harness`/u, 'current plugin docs must not advertise the standalone bare entry');
for (const token of ['enterprise-harness:tdd-executor', 'tdd-run', 'evidence-import', 'agent_id', 'WorktreeCreate', 'NotebookEdit', 'completion predicate']) assert.ok(corpus.includes(token), `current docs missing ${token}`);
assert.match(fs.readFileSync(path.join(root, 'harness/specs/directory-model.md'), 'utf-8'), /hooks\/hooks\.json[\s\S]*CLAUDE_PLUGIN_ROOT[\s\S]*\.claude\/settings\.json[\s\S]*CLAUDE_PROJECT_DIR/u);
console.log('PASS current-doc-surface verify');
