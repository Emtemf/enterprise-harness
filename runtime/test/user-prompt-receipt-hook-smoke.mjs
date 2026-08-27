import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindLatestPromptReceipt, promptBindingCovers, readPromptBinding } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const hook = path.join(sourceRoot, 'hooks', 'scripts', 'user-prompt-receipt.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-prompt-hook-'));

try {
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  const event = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'prompt-session',
    cwd: root,
    prompt: 'Build order cancellation. Do not change payment.',
  };
  const result = spawnSync(process.execPath, [hook], {
    cwd: root,
    input: JSON.stringify(event),
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  bindLatestPromptReceipt(root, 'prompt-change', event.session_id);
  const binding = readPromptBinding(root, 'prompt-change');
  assert.equal(binding.source, 'UserPromptSubmit');
  assert.equal(promptBindingCovers(root, 'prompt-change', event.prompt), true);
  assert.equal(promptBindingCovers(root, 'prompt-change', 'Invent an admin console.'), false);
  assert.equal(promptBindingCovers(root, 'prompt-change', 'Do not change payment.'), false,
    'requirements must preserve the complete prompt clause set, not a convenient subset');

  const malformed = spawnSync(process.execPath, [hook], {
    cwd: root,
    input: '{not-json}',
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(malformed.status, 0, 'receipt hook is explicitly fail-open');
  assert.match(malformed.stderr, /EH-PROMPT-RECEIPT-154/u);

  console.log(`PASS user-prompt-receipt-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
