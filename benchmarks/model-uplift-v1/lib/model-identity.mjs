const matchesAnyFamily = (model, families) => families.some((family) => String(model).toLowerCase().includes(String(family).toLowerCase()));

export function routeIdentityValid(route, messageModels, billingModels) {
  return Boolean(route)
    && messageModels.length > 0
    && billingModels.some((model) => matchesAnyFamily(model, route.billingModelFamilies || []));
}

export function responseIdentityValid(route, messageModels) {
  return Boolean(route)
    && messageModels.length > 0
    && messageModels.every((model) => matchesAnyFamily(model, route.messageModelFamilies || []));
}

export function modelIdentityValid(arm, modelRoutes, billingModels, controllerMessageModels, workerMessageModels = []) {
  const controllerRoute = modelRoutes[arm.controllerRoute];
  if (!routeIdentityValid(controllerRoute, controllerMessageModels, billingModels)) return false;
  const workerRoutes = (arm.workerRoutes || []).map((routeId) => modelRoutes[routeId]);
  if (workerRoutes.length === 0) {
    return workerMessageModels.length === 0;
  }
  if (workerMessageModels.length === 0 || workerRoutes.some((route) => !route)) return false;
  return workerRoutes.every((route) => billingModels.some((model) => matchesAnyFamily(model, route.billingModelFamilies || [])));
}
