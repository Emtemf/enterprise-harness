import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bindLatestPromptReceipt,
  promptBindingCovers,
  promptClauseLiterals,
  readPromptBinding,
} from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const hook = path.join(sourceRoot, 'hooks', 'scripts', 'user-prompt-receipt.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-prompt-hook-'));

try {
  assert.deepEqual(
    promptClauseLiterals('Use Stripe Java 24.0.0. Retry failures?'),
    ['Use Stripe Java 24.0.0', 'Retry failures'],
    'semantic clause splitting must preserve dotted version literals',
  );
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  const event = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'prompt-session',
    cwd: root,
    prompt: '/enterprise-harness:harness\n\nBuild order cancellation. Do not change payment.',
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
  assert.equal(binding.clauseDigests.length, 2, 'the slash-command routing literal is not a requirement clause');
  assert.equal(promptBindingCovers(root, 'prompt-change', event.prompt), true);
  assert.equal(promptBindingCovers(root, 'prompt-change', 'Build order cancellation. Do not change payment.'), true,
    'requirements omit the control-plane slash-command while preserving every semantic user clause');
  assert.equal(promptBindingCovers(root, 'prompt-change', '> Build order cancellation.\n> Do not change payment.'), true,
    'Markdown blockquote storage does not change the semantic user clauses');
  assert.equal(promptBindingCovers(root, 'prompt-change', 'Invent an admin console.'), false);
  assert.equal(promptBindingCovers(root, 'prompt-change', 'Do not change payment.'), false,
    'requirements must preserve the complete prompt clause set, not a convenient subset');

  const inlineEvent = {
    hook_event_name: 'UserPromptSubmit',
    session_id: 'inline-prompt-session',
    cwd: root,
    prompt: '/enterprise-harness:harness Build order cancellation. Do not change payment.',
  };
  const inlineResult = spawnSync(process.execPath, [hook], {
    cwd: root,
    input: JSON.stringify(inlineEvent),
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(inlineResult.status, 0, inlineResult.stderr);
  bindLatestPromptReceipt(root, 'inline-prompt-change', inlineEvent.session_id);
  assert.equal(promptBindingCovers(root, 'inline-prompt-change', 'Build order cancellation. Do not change payment.'), true,
    'an inline slash-command prefix is control-plane routing, not part of the first requirement clause');

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
