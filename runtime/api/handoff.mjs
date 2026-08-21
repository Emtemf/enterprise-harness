// Runtime public API: handoff inputs.
// Skills may only import from runtime/api/*; runtime/core and runtime/lib are internal.

export { loadHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
export { readClassificationArtifact } from '../core/classification-artifact.mjs';
