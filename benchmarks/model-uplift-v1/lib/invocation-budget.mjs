const EPSILON_USD = 0.001;

function invocationCost(invocation) {
  const cost = Number(invocation?.usage?.costUsd);
  return Number.isFinite(cost) && cost >= 0 ? cost : 0;
}

export function invocationBudgetStatus(budgetUsd, invocations) {
  const limit = Number(budgetUsd);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('budgetUsd must be a positive number');
  const costs = invocations.map(invocationCost);
  const spentUsd = costs.reduce((sum, cost) => sum + cost, 0);
  const remainingUsd = limit - spentUsd;
  const reserveUsd = costs.length > 0 ? Math.max(...costs) : 0;
  const allowed = remainingUsd > EPSILON_USD
    && (reserveUsd === 0 || remainingUsd + EPSILON_USD >= reserveUsd);
  return Object.freeze({
    allowed,
    spentUsd,
    remainingUsd,
    reserveUsd,
    stopReason: allowed ? null : (remainingUsd <= EPSILON_USD
      ? 'budget-limit-reached'
      : 'insufficient-remaining-invocation-budget'),
  });
}

export function budgetLimitValid(budgetUsd, invocations) {
  return invocationBudgetStatus(budgetUsd, invocations).spentUsd <= Number(budgetUsd) + EPSILON_USD;
}
