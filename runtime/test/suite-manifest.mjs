export const SMOKE_PROFILES = Object.freeze({
  platform: Object.freeze([
    'current-node-propagation-smoke.mjs',
    'gates-governed-target-unit-smoke.mjs',
    'governed-task-run-write-gate-smoke.mjs',
    'implement-skill-script-smoke.mjs',
    'local-adapter-diagnostics-smoke.mjs',
    'portable-launcher-smoke.mjs',
    'runtime-launcher-contract-smoke.mjs',
    'safe-paths-adversarial-smoke.mjs',
    'task-child-contract-smoke.mjs',
    'task-child-process-group-smoke.mjs',
    'task-lock-smoke.mjs',
    'task-runner-v6-smoke.mjs',
    'task-worktree-integration-contract-smoke.mjs',
  ]),
  skill: Object.freeze([
    'plugin-entry-agent-contract-smoke.mjs',
    'review-rubric-selector-smoke.mjs',
    'skill-content-contract-smoke.mjs',
    'skill-first-wiring-smoke.mjs',
    'skill-packaging-smoke.mjs',
  ]),
});
