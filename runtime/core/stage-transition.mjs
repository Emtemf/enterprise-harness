export const STAGE_SEQUENCE = Object.freeze([
  'clarify',
  'design',
  'plan',
  'implement',
  'verify',
  'archive',
]);

const STAGE_SET = new Set(STAGE_SEQUENCE);

export function expectedNextStage(stage) {
  const index = STAGE_SEQUENCE.indexOf(stage);
  if (index === -1 || index === STAGE_SEQUENCE.length - 1) return null;
  return STAGE_SEQUENCE[index + 1];
}

export function assertForwardTransition(fromStage, toStage) {
  const expected = expectedNextStage(fromStage);
  if (!STAGE_SET.has(fromStage) || !STAGE_SET.has(toStage) || toStage !== expected) {
    throw new Error(`EH-TRANSITION-001: expected ${fromStage} -> ${expected ?? 'none'}, received ${toStage}`);
  }
}
