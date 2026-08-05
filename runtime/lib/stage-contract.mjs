// 每个 workflow 阶段的可审计合同。
//
// 它回答三个不同问题：
// 1. 当阶段完成时，state.json 必须呈现哪些 durable 投影？
// 2. 哪些 change 内文件必须已经存在？
// 3. 哪些 governed handoff behavior 必须已经产生 execute + 独立 check 证据？
//
// optionalBehaviors 只在该能力被实际派发后才要求闭环；requiredBehaviors 则是阶段
// 进入下一阶段前不可缺少的最小闭环。不要从 SKILL.md 正则推导这份合同：skill 是给模型
// 的操作指令，runtime 需要一个稳定、可测试、机器可读的判定源。
export const STAGE_ORDER = ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive'];

export const STAGE_CONTRACTS = Object.freeze({
  clarify: {
    artifacts: ['requirements.md'],
    state: (data) => [
      ['workflow.clarifyReady', data.workflow?.clarifyReady === true],
      ['workflow.userConfirmedScope', data.workflow?.userConfirmedScope === true],
    ],
    requiredBehaviors: ['clarify.synthesize'],
    optionalBehaviors: ['clarify.explore-code', 'clarify.research-docs'],
  },
  route: {
    artifacts: ['change.md'],
    state: (data) => [
      ['workflow.routeReady', data.workflow?.routeReady === true],
      ['impact.api', data.impact?.api !== 'unknown'],
      ['impact.data', data.impact?.data !== 'unknown'],
      ['impact.architecture', data.impact?.architecture !== 'unknown'],
      ['impact.rule', data.impact?.rule !== 'unknown'],
    ],
    requiredBehaviors: ['route.decide'],
    optionalBehaviors: ['route.explore-code'],
  },
  design: {
    artifacts: ['design.md', 'reviews/design-reviewer.json'],
    state: (data) => [
      ['gates.designApproved', data.gates?.designApproved === true],
    ],
    requiredBehaviors: ['design.produce'],
    optionalBehaviors: ['design.explore-code', 'design.research-docs', 'design.check-api'],
  },
  plan: {
    artifacts: ['tasks.md', 'task-commands.json', 'reviews/plan-critic.json'],
    state: (data) => [
      ['workflow.planReady', data.workflow?.planReady === true],
    ],
    requiredBehaviors: ['plan.produce'],
    optionalBehaviors: [],
  },
  tdd: {
    artifacts: [],
    state: (data) => [
      ['workflow.tddStatus', data.workflow?.tddStatus === 'refactor-verified'],
      ['currentTask', Boolean(String(data.currentTask || '').trim())],
    ],
    requiredBehaviors: ['tdd.execute-task'],
    optionalBehaviors: [],
  },
  verify: {
    artifacts: ['validation.md'],
    state: (data) => [
      ['validation.status', data.validation?.status === 'fresh'],
      ['validation.digest', Boolean(String(data.validation?.digest || '').trim())],
    ],
    requiredBehaviors: ['verify.collect'],
    optionalBehaviors: ['verify.explore-code', 'verify.check-api'],
  },
  archive: {
    artifacts: [],
    state: () => [],
    requiredBehaviors: [],
    optionalBehaviors: [],
  },
});

export function completedStages(data, includeCurrent = false) {
  const current = String(data?.workflow?.stage || 'clarify');
  const index = STAGE_ORDER.indexOf(current);
  if (index < 0) return [];
  // 普通 audit 只审已离开的阶段；final completion 则连当前 verify 一并审，
  // 否则 state=VALIDATED 但还没有 verify.collect/check 也可能被误判完成。
  return STAGE_ORDER.slice(0, index + (includeCurrent ? 1 : 0));
}
