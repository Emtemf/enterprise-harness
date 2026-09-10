import crypto from 'node:crypto';

export class WebhookError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.code = code;
  }
}

export class WebhookVerifier {
  constructor({ secret, replayStore }) {
    this.secret = secret;
    this.replayStore = replayStore;
  }

  async verify({ rawBody, signatureHeader, nowSeconds }) {
    const fields = String(signatureHeader || '').split(',').map((field) => field.trim());
    const timestamps = fields.filter((field) => field.startsWith('t=')).map((field) => field.slice(2));
    const signatures = fields.filter((field) => field.startsWith('v1=')).map((field) => field.slice(3));
    if (timestamps.length !== 1 || !/^\d+$/u.test(timestamps[0]) || !signatures.some((value) => /^[a-f\d]{64}$/iu.test(value))) {
      throw new WebhookError('SIGNATURE_MALFORMED');
    }
    const timestamp = Number(timestamps[0]);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
      throw new WebhookError('WEBHOOK_TIMESTAMP_OUT_OF_RANGE');
    }
    const expected = crypto.createHmac('sha256', this.secret).update(`${timestamp}.${rawBody}`).digest();
    const valid = signatures.filter((value) => /^[a-f\d]{64}$/iu.test(value)).some((value) => {
      const supplied = Buffer.from(value, 'hex');
      return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    });
    if (!valid) throw new WebhookError('WEBHOOK_SIGNATURE_INVALID');
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (cause) {
      throw new WebhookError('WEBHOOK_PAYLOAD_INVALID', cause);
    }
    if (!payload || typeof payload.id !== 'string' || payload.id.length === 0 || typeof payload.type !== 'string' || payload.type.length === 0) {
      throw new WebhookError('WEBHOOK_PAYLOAD_INVALID');
    }
    const claimed = await this.replayStore.claim({ eventId: payload.id, timestamp });
    if (!claimed) throw new WebhookError('WEBHOOK_REPLAY');
    return { eventId: payload.id, type: payload.type, timestamp, payload };
  }
}
