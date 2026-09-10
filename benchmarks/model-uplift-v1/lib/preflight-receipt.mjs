export function validatePreflightReceipt(receipt, { expectedModels, environmentFingerprint, claudeCodeVersion, now = Date.now() }) {
  const generatedAt = Date.parse(receipt.generatedAt);
  const maxAgeMs = Number(receipt.expiresAfterHours || 24) * 60 * 60 * 1000;
  const probedModels = new Set((receipt.probes || [])
    .filter(({ identityValid, complete, exitCode }) => identityValid && complete && exitCode === 0)
    .map(({ requestedModel }) => requestedModel));
  if (receipt.status !== 'pass') throw new Error('preflight receipt status is not pass');
  if (!Number.isFinite(generatedAt) || now - generatedAt > maxAgeMs || generatedAt > now + 60_000) {
    throw new Error('preflight receipt is expired or has an invalid timestamp');
  }
  if (receipt.claudeCodeVersion !== claudeCodeVersion || receipt.environmentFingerprint !== environmentFingerprint) {
    throw new Error('preflight receipt does not match the current Claude routing environment');
  }
  if ([...expectedModels].some((model) => !probedModels.has(model))) {
    throw new Error('preflight receipt does not cover every selected model family');
  }
  return receipt;
}
