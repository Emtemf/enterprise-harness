const DIGEST = /^[a-f0-9]{64}$/u;
const CLOCK_TOLERANCE_MS = 120_000;
const keyOf = ({ armId, caseId, repetition }) => `${armId}\u0000${caseId}\u0000${repetition}`;

function windowsOf(record) {
  return (record.invocations || []).map(({ startedAt, completedAt }) => ({
    start: Date.parse(startedAt),
    end: Date.parse(completedAt),
  })).filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end >= start);
}

function validateTariff(tariff, routingProfile) {
  if (!tariff || tariff.schemaVersion !== 3 || tariff.status !== 'confirmed'
    || tariff.authority !== 'user-confirmed-relay-request-tariff'
    || tariff.chargingBasis !== 'per-proxy-request' || tariff.routingProfile !== routingProfile) {
    throw new Error('relay tariff must be a confirmed schemaVersion=3 per-request tariff for the routing profile');
  }
  for (const [model, entry] of Object.entries(tariff.models || {})) {
    if (!model || !Number.isFinite(entry?.chargeUnitsPerRequest) || entry.chargeUnitsPerRequest < 0) {
      throw new Error(`relay tariff has an invalid request rate: ${model || '<empty>'}`);
    }
  }
  return tariff;
}

export function attachRouteReceipt(raw, receipt, suppliedTariff) {
  if (!receipt || receipt.schemaVersion !== 1 || receipt.status !== 'final' || receipt.authority !== 'cc-switch-proxy-log') {
    throw new Error('route receipt must be schemaVersion=1, status=final, authority=cc-switch-proxy-log');
  }
  if (!DIGEST.test(String(receipt.sourceDigest || '')) || !Number.isFinite(Date.parse(receipt.generatedAt))) {
    throw new Error('route receipt requires sourceDigest and generatedAt');
  }
  if (receipt.runnerCommit !== raw.runnerCommit || receipt.routingProfile !== raw.routingProfile) {
    throw new Error('route receipt does not match runner commit or routing profile');
  }
  const tariff = validateTariff(suppliedTariff, raw.routingProfile);
  if (!Array.isArray(receipt.records)) throw new Error('route receipt records must be an array');
  const receiptByKey = new Map();
  const allRequestIds = new Set();
  for (const item of receipt.records) {
    const key = keyOf(item);
    if (receiptByKey.has(key)) throw new Error(`duplicate route receipt record: ${key}`);
    if (typeof item.claudeSessionId !== 'string' || !item.claudeSessionId || !Array.isArray(item.requests) || item.requests.length === 0) {
      throw new Error(`route receipt record lacks session or requests: ${key}`);
    }
    for (const request of item.requests) {
      if (typeof request.proxyRequestId !== 'string' || !request.proxyRequestId || typeof request.model !== 'string' || !request.model
        || typeof request.requestModel !== 'string' || !request.requestModel || !Number.isFinite(Date.parse(request.observedAt))) {
        throw new Error(`route receipt has invalid request evidence: ${key}`);
      }
      if (allRequestIds.has(request.proxyRequestId)) throw new Error(`proxy request id is assigned more than once: ${request.proxyRequestId}`);
      allRequestIds.add(request.proxyRequestId);
    }
    receiptByKey.set(key, item);
  }
  const rawKeys = new Set();
  const records = (raw.records || []).map((record) => {
    const key = keyOf(record);
    if (rawKeys.has(key)) throw new Error(`duplicate benchmark result record: ${key}`);
    rawKeys.add(key);
    const evidence = receiptByKey.get(key);
    if (!evidence) throw new Error(`route receipt is missing record: ${key}`);
    if (!record.claudeSessionId || evidence.claudeSessionId !== record.claudeSessionId) {
      throw new Error(`route receipt session mismatch: ${key}`);
    }
    const windows = windowsOf(record);
    if (windows.length === 0) throw new Error(`benchmark result lacks invocation timestamps: ${key}`);
    for (const request of evidence.requests) {
      const observedAt = Date.parse(request.observedAt);
      if (!windows.some(({ start, end }) => observedAt >= start - CLOCK_TOLERANCE_MS && observedAt <= end + CLOCK_TOLERANCE_MS)) {
        throw new Error(`proxy request timestamp is outside benchmark invocation windows: ${request.proxyRequestId}`);
      }
    }
    const routeModels = [...new Set(evidence.requests.map(({ model }) => model))].sort();
    const expectedModels = new Set([record.actualControllerModel, ...(record.actualWorkerModels || [])].filter(Boolean));
    if ([...expectedModels].some((model) => !routeModels.includes(model))) {
      throw new Error(`CC Switch model evidence does not cover expected route for ${record.armId}/${record.caseId}/${record.repetition}`);
    }
    const allowedModels = new Set(record.allowedActualModels || [...expectedModels]);
    if (routeModels.some((model) => !allowedModels.has(model))) {
      throw new Error(`CC Switch route contains a disallowed actual model for ${record.armId}/${record.caseId}/${record.repetition}`);
    }
    const relayRequestCountsByModel = Object.fromEntries(routeModels.map((model) => [
      model,
      evidence.requests.filter((request) => request.model === model).length,
    ]));
    const relayChargeUnits = evidence.requests.reduce((sum, request) => {
      const rate = tariff.models?.[request.model]?.chargeUnitsPerRequest;
      if (!Number.isFinite(rate)) throw new Error(`relay tariff has no request rate for model: ${request.model}`);
      return sum + rate;
    }, 0);
    return {
      ...record,
      modelTierIdentityValid: true,
      routeAuthority: receipt.authority,
      routeModels,
      relayChargeAuthority: tariff.authority,
      relayRequestCount: evidence.requests.length,
      relayRequestCountsByModel,
      relayChargeUnits,
      proxyRequestIds: evidence.requests.map(({ proxyRequestId }) => proxyRequestId).sort(),
    };
  });
  if (receiptByKey.size !== records.length) throw new Error('route receipt contains records that are not present in benchmark results');
  return {
    ...raw,
    routeReceipt: {
      authority: receipt.authority,
      generatedAt: receipt.generatedAt,
      sourceDigest: receipt.sourceDigest,
      recordCount: receipt.records.length,
    },
    relayTariff: {
      authority: tariff.authority,
      chargingBasis: tariff.chargingBasis,
      unit: tariff.unit,
      models: tariff.models,
    },
    records,
  };
}
