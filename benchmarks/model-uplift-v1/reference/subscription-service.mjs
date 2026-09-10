export class DomainError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.code = code;
  }
}

export class InMemorySubscriptionRepository {
  constructor(rows = []) {
    this.rows = new Map(rows.map((row) => [row.id, { ...row }]));
    this.saveCount = 0;
  }
  get(id) { const row = this.rows.get(id); return row ? { ...row } : null; }
  save(row) { this.saveCount += 1; this.rows.set(row.id, { ...row }); return { ...row }; }
}

export class SubscriptionService {
  constructor({ repository, billingGateway, auditSink }) {
    this.repository = repository;
    this.billingGateway = billingGateway;
    this.auditSink = auditSink;
    this.operations = new Map();
  }
  getPlan(subscriptionId) { return this.repository.get(subscriptionId)?.plan ?? null; }
  async changePlan(input) {
    const fingerprint = JSON.stringify([input.subscriptionId, input.targetPlan, input.expectedVersion]);
    const existing = this.operations.get(input.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT');
      return existing.promise;
    }
    const promise = this.changePlanOnce(input);
    this.operations.set(input.requestId, { fingerprint, promise });
    try { return await promise; }
    catch (error) { this.operations.delete(input.requestId); throw error; }
  }
  async changePlanOnce({ subscriptionId, requestId, targetPlan, expectedVersion }) {
    if (!['BASIC', 'PRO', 'ENTERPRISE'].includes(targetPlan)) throw new DomainError('PLAN_INVALID');
    const current = this.repository.get(subscriptionId);
    if (!current) throw new DomainError('SUBSCRIPTION_NOT_FOUND');
    if (current.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT');
    try { await this.billingGateway.changePlan({ subscriptionId, targetPlan, requestId }); }
    catch (cause) { throw new DomainError('BILLING_UPDATE_FAILED', cause); }
    const next = { ...current, plan: targetPlan, version: expectedVersion + 1 };
    this.repository.save(next);
    await this.auditSink.append({ subscriptionId, requestId, type: 'SUBSCRIPTION_PLAN_CHANGED', fromPlan: current.plan, toPlan: targetPlan, version: next.version });
    return { subscriptionId, requestId, plan: targetPlan, version: next.version };
  }
}
