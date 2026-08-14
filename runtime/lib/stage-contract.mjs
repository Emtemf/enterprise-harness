// 每个 v6 workflow 阶段的可审计合同。
//
// 它回答三个不同问题：
// 1. 当阶段完成时，state.json 必须呈现哪些 durable 状态？
// 2. 哪些 change 内文件必须已经存在？
// 3. 哪些结构化 result gate 必须由 runtime 验证？
//
// Skill 是给模型的操作合同；这里是 runtime 的稳定、可测试机器判定源。v6 不得
// 引用 v5 behavior registry、lifecycle callback 或 state projection 作为完成证据。
export const STAGE_ORDER = ['clarify', 'design', 'plan', 'implement', 'verify', 'archive'];

export const STAGE_CONTRACTS = Object.freeze({
  clarify: {
    artifacts: ['requirements.md'],
    state: (data) => [['classification', Boolean(data.classification?.tier && data.classification?.impact)]],
    resultGate: null,
  },
  design: {
    artifacts: ['design.md'],
    state: () => [],
    resultGate: 'design',
  },
  plan: {
    artifacts: ['tasks.md'],
    state: () => [],
    resultGate: null,
  },
  implement: {
    artifacts: [],
    state: (data) => [['currentTask', Boolean(String(data.currentTask || '').trim())]],
    resultGate: null,
  },
  verify: {
    artifacts: ['validation.md'],
    state: (data) => [
      ['validation.status', data.validation?.status === 'fresh'],
      ['validation.digest', Boolean(String(data.validation?.digest || '').trim())],
    ],
    resultGate: null,
  },
  archive: {
    artifacts: [],
    state: () => [],
    resultGate: null,
  },
});

export function completedStages(data, includeCurrent = false) {
  const current = String(data?.stage ?? data?.workflow?.stage ?? 'clarify');
  const index = STAGE_ORDER.indexOf(current);
  if (index < 0) return [];
  return STAGE_ORDER.slice(0, index + (includeCurrent ? 1 : 0));
}
