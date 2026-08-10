import type { PlannedRoute } from "./types.js";

const MAX_ROUTES = 20;
const routes = new Map<string, PlannedRoute>();

export function cacheRoute(route: PlannedRoute): void {
  routes.set(route.route_id, route);

  while (routes.size > MAX_ROUTES) {
    const oldestKey = routes.keys().next().value;
    if (oldestKey === undefined) break;
    routes.delete(oldestKey);
  }
}

export function getCachedRoute(routeId: string): PlannedRoute | undefined {
  return routes.get(routeId);
}
