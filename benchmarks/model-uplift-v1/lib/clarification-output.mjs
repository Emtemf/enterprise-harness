export function bareFinalRequirements(text) {
  const value = String(text || '');
  return /CLARIFICATION_COMPLETE/u.test(value) ? value : '';
}
