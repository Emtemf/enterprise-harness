import assert from 'node:assert/strict';
import { suggestHandoffCommand } from '../lib/handoff-guidance.mjs';

const mode = process.argv[2] || 'verify';
const root = process.cwd();

// pre-agent rejects any Agent dispatch whose prompt lacks HANDOFF_INPUT, but the
// skill only documented `handoff create ... execute` with literal ellipses and
// never mapped an agent type to its behavior name. A weak model cannot recover
// from a rule it is told to satisfy without being told how, so the block itself
// must carry the exact command.
const explore = suggestHandoffCommand(root, 'enterprise-harness:code-explore', 'fixture-change');
assert.equal(explore.behavior, 'clarify.explore-code');
assert.equal(explore.stage, 'clarify');
assert.match(explore.command, /handoff create fixture-change clarify clarify\.explore-code execute/u);

// The bare spelling is the same governed agent when definitions load locally.
const bare = suggestHandoffCommand(root, 'code-explore', 'fixture-change');
assert.equal(bare.behavior, 'clarify.explore-code');

// A checker dispatch needs the executor run id, so the suggestion must say so
// rather than emitting an execute command that would create a second executor.
const checker = suggestHandoffCommand(root, 'enterprise-harness:design-reviewer', 'fixture-change');
assert.equal(checker.role, 'check');
assert.equal(checker.behavior, 'design.produce');
assert.match(checker.command, /check <executor-run-id>/u);

// Several behaviors share one executor, so the suggestion must not silently pick
// one and hide the alternative.
const designExecutor = suggestHandoffCommand(root, 'enterprise-harness:design-executor', 'fixture-change');
assert.ok(
  designExecutor.alternatives.length >= 1,
  'an agent serving multiple behaviors must surface the alternatives',
);

const unknown = suggestHandoffCommand(root, 'enterprise-harness:not-a-real-agent', 'fixture-change');
assert.equal(unknown, null, 'an unregistered agent type has no behavior to suggest');

console.log(`PASS handoff-guidance ${mode}`);
