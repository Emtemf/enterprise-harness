const DIGEST = /^[a-f0-9]{64}$/u;
const keyOf = ({ armId, caseId, repetition }) => `${armId}\u0000${caseId}\u0000${repetition}`;
const CLOCK_TOLERANCE_MS = 120_000;

function invocationWindows(record) {
  return (record.invocations || []).map(({ startedAt, completedAt }) => ({
    startedAt: Date.parse(startedAt),
    completedAt: Date.parse(completedAt),
  })).filter(({ startedAt, completedAt }) => Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt >= startedAt);
}

export function attachProviderReceipt(raw, receipt) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.status !== 'final' || receipt.authority !== 'provider-billing-export') {
    throw new Error('provider receipt must be schemaVersion=1, status=final, authority=provider-billing-export');
  }
  if (!DIGEST.test(String(receipt.sourceDigest || ''))) throw new Error('provider receipt requires sourceDigest');
  if (!Number.isFinite(Date.parse(receipt.generatedAt))) throw new Error('provider receipt requires generatedAt');
  if (receipt.runnerCommit !== raw.runnerCommit || receipt.routingProfile !== raw.routingProfile) {
    throw new Error('provider receipt does not match runner commit or routing profile');
  }
  if (!Array.isArray(receipt.records)) throw new Error('provider receipt records must be an array');
  const receiptByKey = new Map();
  const providerRequestIds = new Set();
  for (const item of receipt.records) {
    const key = keyOf(item);
    if (receiptByKey.has(key)) throw new Error(`duplicate provider receipt record: ${key}`);
    if (!Array.isArray(item.requests) || item.requests.length === 0) throw new Error(`provider receipt record lacks requests: ${key}`);
    for (const request of item.requests) {
      const requestId = request.providerRequestId;
      if (typeof requestId !== 'string' || !requestId.trim() || typeof request.model !== 'string' || !request.model.trim()
        || !Number.isFinite(Date.parse(request.observedAt)) || !Number.isFinite(request.costUsd) || request.costUsd < 0) {
        throw new Error(`provider receipt record has invalid request evidence: ${key}`);
      }
      if (providerRequestIds.has(requestId)) throw new Error(`provider request id is assigned more than once: ${requestId}`);
      providerRequestIds.add(requestId);
    }
    receiptByKey.set(key, item);
  }
  const rawKeys = new Set();
  const records = (raw.records || []).map((record) => {
    const rawKey = keyOf(record);
    if (rawKeys.has(rawKey)) throw new Error(`duplicate benchmark result record: ${rawKey}`);
    rawKeys.add(rawKey);
    const receiptRecord = receiptByKey.get(keyOf(record));
    if (!receiptRecord) throw new Error(`provider receipt is missing record: ${keyOf(record)}`);
    const windows = invocationWindows(record);
    if (windows.length === 0) throw new Error(`benchmark result lacks invocation timestamps: ${keyOf(record)}`);
    for (const request of receiptRecord.requests) {
      const observedAt = Date.parse(request.observedAt);
      if (!windows.some((window) => observedAt >= window.startedAt - CLOCK_TOLERANCE_MS
        && observedAt <= window.completedAt + CLOCK_TOLERANCE_MS)) {
        throw new Error(`provider request timestamp is outside benchmark invocation windows: ${request.providerRequestId}`);
      }
    }
    const providerModels = [...new Set(receiptRecord.requests.map(({ model }) => model))].sort();
    const expectedModels = new Set([record.actualControllerModel, ...(record.actualWorkerModels || [])].filter(Boolean));
    if ([...expectedModels].some((model) => !providerModels.includes(model))) {
      throw new Error(`provider model evidence does not cover expected route for ${record.armId}/${record.caseId}/${record.repetition}`);
    }
    const allowedModels = new Set(record.allowedActualModels || [...expectedModels]);
    if (providerModels.some((model) => !allowedModels.has(model))) {
      throw new Error(`provider receipt contains a disallowed actual model for ${record.armId}/${record.caseId}/${record.repetition}`);
    }
    const providerCostUsd = receiptRecord.requests.reduce((sum, request) => sum + request.costUsd, 0);
    return {
      ...record,
      costAuthority: 'provider-billing',
      providerCostUsd,
      providerModels,
      providerRequestIds: receiptRecord.requests.map(({ providerRequestId }) => providerRequestId).sort(),
      modelTierIdentityValid: true,
      providerBillingValid: true,
    };
  });
  if (receiptByKey.size !== records.length) throw new Error('provider receipt contains records that are not present in benchmark results');
  return {
    ...raw,
    providerReceipt: {
      authority: receipt.authority,
      generatedAt: receipt.generatedAt,
      sourceDigest: receipt.sourceDigest,
      recordCount: receipt.records.length,
    },
    records,
  };
}
