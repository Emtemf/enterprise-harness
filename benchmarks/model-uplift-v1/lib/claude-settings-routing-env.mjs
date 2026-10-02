import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROUTING_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
];

export function currentClaudeRoutingEnv(baseEnv = process.env, settingsPath = null) {
  const configuredDir = typeof baseEnv.CLAUDE_CONFIG_DIR === 'string' && baseEnv.CLAUDE_CONFIG_DIR.trim()
    ? path.resolve(baseEnv.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
  const target = settingsPath ? path.resolve(settingsPath) : path.join(configuredDir, 'settings.json');
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return { ...baseEnv };
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch (error) {
    throw new Error(`Claude settings routing source is invalid JSON: ${error.message}`);
  }
  const configured = settings?.env && typeof settings.env === 'object' && !Array.isArray(settings.env)
    ? settings.env : {};
  const routing = Object.fromEntries(ROUTING_KEYS.flatMap((key) => (
    typeof configured[key] === 'string' && configured[key].trim() ? [[key, configured[key]]] : []
  )));
  return { ...baseEnv, ...routing };
}

export const claudeRoutingKeys = Object.freeze([...ROUTING_KEYS]);
