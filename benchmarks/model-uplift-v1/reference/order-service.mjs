export class DomainError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.code = code;
  }
}

export class InMemoryOrderRepository {
  constructor(orders = []) {
    this.orders = new Map(orders.map((order) => [order.id, { ...order }]));
  }

  get(id) {
    const order = this.orders.get(id);
    return order ? { ...order } : null;
  }

  save(order) {
    this.orders.set(order.id, { ...order });
    return { ...order };
  }
}

export class OrderService {
  constructor({ repository, refundGateway, auditSink }) {
    this.repository = repository;
    this.refundGateway = refundGateway;
    this.auditSink = auditSink;
    this.inflight = new Map();
    this.completed = new Map();
  }

  status(orderId) {
    return this.repository.get(orderId)?.status ?? null;
  }

  async cancel({ orderId, requestId }) {
    const completed = this.completed.get(requestId);
    if (completed) return completed;
    const inflight = this.inflight.get(requestId);
    if (inflight) return inflight;

    const operation = this.cancelOnce({ orderId, requestId });
    this.inflight.set(requestId, operation);
    try {
      const result = await operation;
      this.completed.set(requestId, result);
      return result;
    } finally {
      this.inflight.delete(requestId);
    }
  }

  async cancelOnce({ orderId, requestId }) {
    const order = this.repository.get(orderId);
    if (!order) throw new DomainError('ORDER_NOT_FOUND');
    if (order.status !== 'PENDING') throw new DomainError('ORDER_NOT_PENDING');

    let refund;
    try {
      refund = await this.refundGateway.refund({ orderId, requestId });
    } catch (cause) {
      throw new DomainError('REFUND_FAILED', cause);
    }
    this.repository.save({ ...order, status: 'CANCELLED' });
    const result = { orderId, requestId, status: 'CANCELLED', refundId: refund?.refundId ?? null };
    await this.auditSink.append({ orderId, requestId, type: 'ORDER_CANCELLED' });
    return result;
  }
}
