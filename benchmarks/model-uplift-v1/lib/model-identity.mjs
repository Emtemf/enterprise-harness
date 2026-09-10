const matchesAnyFamily = (model, families) => families.some((family) => String(model).toLowerCase().includes(String(family).toLowerCase()));

export function routeIdentityValid(route, messageModels, billingModels) {
  return Boolean(route)
    && messageModels.length > 0
    && messageModels.every((model) => matchesAnyFamily(model, route.messageModelFamilies || []))
    && billingModels.some((model) => matchesAnyFamily(model, route.billingModelFamilies || []));
}

export function modelIdentityValid(arm, modelRoutes, billingModels, controllerMessageModels, workerMessageModels = []) {
  const controllerRoute = modelRoutes[arm.controllerRoute];
  if (!routeIdentityValid(controllerRoute, controllerMessageModels, billingModels)) return false;
  const workerRoutes = (arm.workerRoutes || []).map((routeId) => modelRoutes[routeId]);
  if (workerRoutes.length === 0) {
    return workerMessageModels.length === 0
      && billingModels.every((model) => matchesAnyFamily(model, controllerRoute.billingModelFamilies || []));
  }
  if (workerMessageModels.length === 0 || workerRoutes.some((route) => !route)) return false;
  if (!workerMessageModels.every((model) => workerRoutes.some((route) => matchesAnyFamily(model, route.messageModelFamilies || [])))) return false;
  const allRoutes = [controllerRoute, ...workerRoutes];
  return billingModels.every((model) => allRoutes.some((route) => matchesAnyFamily(model, route.billingModelFamilies || [])))
    && workerRoutes.every((route) => billingModels.some((model) => matchesAnyFamily(model, route.billingModelFamilies || [])));
}
