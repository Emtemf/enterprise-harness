export function modelIdentityValid(arm, billingModels, messageModels) {
  const allowedFamilies = arm.id === 'haiku-harness'
    ? ['haiku', 'sonnet']
    : [String(arm.model).toLowerCase()];
  const observedModels = [...billingModels, ...messageModels].map((value) => String(value).toLowerCase());
  return observedModels.length > 0
    && observedModels.every((model) => allowedFamilies.some((family) => model.includes(family)));
}
