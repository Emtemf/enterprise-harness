const count = (invocation, marker) => Array.isArray(invocation?.callbackDiagnostics)
  ? invocation.callbackDiagnostics.filter((value) => value === marker).length : 0;

export function questionBridgeValidFor(invocations, { pendingQuestionAtEnd = false } = {}) {
  if (!Array.isArray(invocations) || invocations.length === 0 || pendingQuestionAtEnd) return false;
  return invocations.every((invocation) => {
    const answered = count(invocation, 'answered');
    const authorized = count(invocation, 'sdk-canusetool-authorized');
    const persisted = count(invocation, 'sdk-tool-result-persisted');
    return answered === 0
      ? authorized === 0 && persisted === 0
      : answered === 1 && authorized === 1 && persisted === 1;
  });
}
