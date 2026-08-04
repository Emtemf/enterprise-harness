// Forked stage skills sit one layer below the main conversation and must still
// dispatch their own executor and checker. At the spawn-depth limit the Agent
// tool is withheld without an error, so the stage would self-execute and
// self-review in a single context — the exact degradation the harness forbids.

export const SPAWN_DEPTH_ENV = 'CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH';
export const REQUIRED_SPAWN_DEPTH = 2;
export const RECOMMENDED_SPAWN_DEPTH = 3;

const REMEDY = `在 .claude/settings.json 的 env 中设置 "${SPAWN_DEPTH_ENV}": "${RECOMMENDED_SPAWN_DEPTH}"，然后重启会话。`;

export function evaluateSpawnDepth(env = process.env) {
  const raw = env[SPAWN_DEPTH_ENV];

  if (raw === undefined || String(raw).trim() === '') {
    return {
      ok: null,
      severity: 'warn',
      status: 'unset',
      value: null,
      detail: `${SPAWN_DEPTH_ENV} 未设置，实际上限由 Claude Code 版本默认值决定（部分版本默认为 1，会静默收走 forked 阶段的 Agent 工具，导致 executor 与 checker 塌成同一上下文）。${REMEDY}`,
    };
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      severity: 'error',
      status: 'invalid',
      value: null,
      detail: `${SPAWN_DEPTH_ENV}="${raw}" 不是合法的非负整数，无法确认 forked 阶段能否派发自己的 executor 和 checker。${REMEDY}`,
    };
  }

  if (value < REQUIRED_SPAWN_DEPTH) {
    return {
      ok: false,
      severity: 'error',
      status: 'too-low',
      value,
      detail: `${SPAWN_DEPTH_ENV}=${value} 低于 forked 阶段所需的 ${REQUIRED_SPAWN_DEPTH}。forked 阶段将拿不到 Agent 工具并自写自审，且不会报错。${REMEDY}`,
    };
  }

  return {
    ok: true,
    severity: 'info',
    status: 'ok',
    value,
    detail: `${SPAWN_DEPTH_ENV}=${value}（forked 阶段可派发自己的 executor 与 checker）`,
  };
}
