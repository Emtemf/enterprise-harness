const has = (invocation, marker) => Array.isArray(invocation?.callbackDiagnostics)
  && invocation.callbackDiagnostics.includes(marker);

export function questionBridgeValidFor(invocations, { pendingQuestionAtEnd = false } = {}) {
  if (!Array.isArray(invocations) || invocations.length === 0 || pendingQuestionAtEnd) return false;
  return invocations.every((invocation) => (
    !has(invocation, 'answered')
    || (has(invocation, 'sdk-pretooluse-authorized') && has(invocation, 'sdk-posttooluse-persisted'))
  ));
}
