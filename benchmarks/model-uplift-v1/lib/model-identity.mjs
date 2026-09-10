const matchesFamily = (model, family) => String(model).toLowerCase().includes(String(family).toLowerCase());

export function controllerIdentityValid(arm, controllerMessageModels, billingModels) {
  const family = arm.controllerModelFamily || arm.model;
  return controllerMessageModels.length > 0
    && controllerMessageModels.every((model) => matchesFamily(model, family))
    && billingModels.some((model) => matchesFamily(model, family));
}

export function modelIdentityValid(arm, billingModels, controllerMessageModels, workerMessageModels = []) {
  if (!controllerIdentityValid(arm, controllerMessageModels, billingModels)) return false;
  const workerFamilies = arm.workerModelFamilies || [];
  if (workerFamilies.length === 0) return workerMessageModels.length === 0
    && billingModels.every((model) => matchesFamily(model, arm.controllerModelFamily || arm.model));
  if (workerMessageModels.length === 0) return false;
  if (!workerMessageModels.every((model) => workerFamilies.some((family) => matchesFamily(model, family)))) return false;
  const allowedBillingFamilies = [arm.controllerModelFamily || arm.model, ...workerFamilies];
  return billingModels.every((model) => allowedBillingFamilies.some((family) => matchesFamily(model, family)))
    && workerFamilies.every((family) => billingModels.some((model) => matchesFamily(model, family)));
}
