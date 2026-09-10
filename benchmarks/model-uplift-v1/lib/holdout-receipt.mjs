const DIGEST = /^[a-f0-9]{64}$/u;
const MECHANISMS = new Set(['container-filesystem-isolation', 'remote-blind-evaluator']);

export function validateHoldoutIsolationReceipt(receipt, { casePackDigest }) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.status !== 'pass') {
    throw new Error('holdout isolation receipt must be schemaVersion=1 and status=pass');
  }
  if (!DIGEST.test(String(receipt.casePackDigest || '')) || receipt.casePackDigest !== casePackDigest) {
    throw new Error('holdout isolation receipt is not bound to this case pack digest');
  }
  if (!MECHANISMS.has(receipt.mechanism)) {
    throw new Error('holdout isolation receipt mechanism must be container-filesystem-isolation or remote-blind-evaluator');
  }
  if (typeof receipt.verifier !== 'string' || !receipt.verifier.trim()) {
    throw new Error('holdout isolation receipt requires a verifier');
  }
  if (!Number.isFinite(Date.parse(receipt.generatedAt))) {
    throw new Error('holdout isolation receipt requires generatedAt');
  }
  return receipt;
}
