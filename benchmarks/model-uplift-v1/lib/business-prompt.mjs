export function businessPromptFor(arm, selectedCase, turn, pendingAnswer, answeredCount) {
  if (arm.workflow === 'enterprise-harness') {
    // Every resume must carry the same semantic user request. The Harness prompt receipt
    // excludes the routing literal but intentionally rejects a different host prompt.
    return `/enterprise-harness:harness\n${selectedCase.initialRequest}`;
  }
  if (turn === 1) {
    return `你处于需求澄清阶段。用户原始请求是：${selectedCase.initialRequest}\n读取仓库代码事实和 docs 下的固定外部文档快照。不得修改产品代码，不得替用户决定业务规则。每轮只问一个最高价值问题；信息充分后输出 CLARIFICATION_COMPLETE 和完整、可验收的需求，并用相对路径标注使用的代码与文档证据。`;
  }
  if (pendingAnswer) return `用户对上一问题的完整回答是：${pendingAnswer}\n记录这个决定，继续澄清；每轮最多问一个问题。`;
  if (answeredCount >= selectedCase.requiredFacts.length) return '所有已提出业务问题都已回答。请自检遗漏，然后完成并输出可验收需求；不要修改产品代码。';
  return '继续澄清当前需求；每轮只问一个最高价值问题，信息充分后输出 CLARIFICATION_COMPLETE 和完整需求。';
}

export function nextNoQuestionStreak(previous, question) {
  return question ? 0 : previous + 1;
}
