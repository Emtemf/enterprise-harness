import crypto from 'node:crypto';

const routingKeys = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
];

export function environmentFingerprint(env, claudeCodeVersion) {
  const routing = Object.fromEntries(routingKeys.map((key) => [key, env[key] || null]));
  return crypto.createHash('sha256').update(JSON.stringify({ claudeCodeVersion, routing })).digest('hex');
}
