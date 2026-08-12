import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheRoute, getCachedRoute } from "./cache.js";
import type {
  Coordinate,
  ExportFormat,
  ExportRouteResult,
  PlannedRoute,
  RouteMap,
  RouteSummary,
  RunType,
} from "./types.js";

const ORS_BASE_URL = "https://api.openrouteservice.org";
const MAX_ATTEMPTS = 4;
const DISTANCE_TOLERANCE = 0.15;

type OrsFeature = {
  geometry?: {
    coordinates?: Array<[number, number] | [number, number, number]>;
  };
  properties?: {
    summary?: {
      distance?: number;
      duration?: number;
      ascent?: number;
      descent?: number;
    };
    segments?: Array<{
      distance?: number;
      duration?: number;
      steps?: Array<{ instruction?: string; distance?: number }>;
    }>;
  };
};

type OrsDirectionsResponse = {
  features?: OrsFeature[];
  error?: { code?: number; message?: string };
};

type GeocodeResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { label?: string; name?: string };
  }>;
  error?: { message?: string };
};

export class RoutePlannerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "missing_api_key"
      | "geocode_not_found"
      | "rate_limited"
      | "no_round_trip"
      | "route_not_found"
      | "ors_error",
  ) {
    super(message);
    this.name = "RoutePlannerError";
  }
}

export async function planRunningRoute(input: {
  distance_km: number;
  start: string;
  run_type?: RunType;
  avoid_hills?: boolean;
}): Promise<RouteSummary> {
  const apiKey = getOrsApiKey();
  const runType = input.run_type ?? "long";
  const avoidHills = input.avoid_hills ?? false;
  validateDistance(input.distance_km);

  const startPoint = await geocodeStart(input.start, apiKey);
  const targetMeters = input.distance_km * 1000;
  let closest: PlannedRoute | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const seed = randomSeed();
    const feature = await requestRoundTrip({
      apiKey,
      coordinate: startPoint.coordinate,
      targetMeters,
      runType,
      avoidHills,
      seed,
    });
    const route = buildPlannedRoute({
      feature,
      requestedDistanceKm: input.distance_km,
      startLabel: startPoint.label,
      runType,
      avoidHills,
      seed,
    });

    if (
      closest === undefined ||
      distanceDelta(route.ors_distance_m, targetMeters) <
        distanceDelta(closest.ors_distance_m, targetMeters)
    ) {
      closest = route;
    }

    if (distanceDelta(route.ors_distance_m, targetMeters) <= DISTANCE_TOLERANCE) {
      break;
    }
  }

  if (closest === undefined) {
    throw new RoutePlannerError(
      `OpenRouteService did not return a round trip near ${input.distance_km} km from ${input.start}.`,
      "no_round_trip",
    );
  }

  cacheRoute(closest);
  return toRouteSummary(closest);
}

export async function exportRunningRoute(input: {
  route_id: string;
  format?: ExportFormat;
}): Promise<ExportRouteResult> {
  const route = getCachedRoute(input.route_id);
  if (route === undefined) {
    throw new RoutePlannerError(
      `No cached route found for route_id "${input.route_id}". Plan a route first; only the last 20 routes are cached.`,
      "route_not_found",
    );
  }

  if ((input.format ?? "gpx") === "maps_link") {
    const url = buildGoogleMapsLink(route.coordinates);
    return {
      route_id: route.route_id,
      format: "maps_link",
      url,
      message:
        "Google Maps walking links support limited waypoints, so this URL is an approximation of the planned route.",
    };
  }

  const exportDir = process.env.ROUTE_EXPORT_DIR ?? join(tmpdir(), "route-planner");
  await mkdir(exportDir, { recursive: true });
  const path = join(exportDir, `${route.route_id}.gpx`);
  await writeFile(path, toGpx(route), "utf8");

  return {
    route_id: route.route_id,
    format: "gpx",
    path,
    message: `Wrote GPX 1.1 track for ${route.total_distance_km.toFixed(2)} km route.`,
  };
}

export function formatPlannerError(error: unknown): string {
  if (error instanceof RoutePlannerError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function getOrsApiKey(): string {
  const apiKey = process.env.ORS_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new RoutePlannerError(
      "ORS_API_KEY is required. Set it in the environment before planning routes.",
      "missing_api_key",
    );
  }
  return apiKey;
}

function validateDistance(distanceKm: number): void {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    throw new RoutePlannerError("distance_km must be a positive number.", "ors_error");
  }
}

async function geocodeStart(
  start: string,
  apiKey: string,
): Promise<{ coordinate: Coordinate; label: string }> {
  const parsed = parseLatLng(start);
  if (parsed !== undefined) {
    return { coordinate: parsed, label: `${parsed.lat},${parsed.lng}` };
  }

  const url = new URL("/geocode/search", ORS_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("text", start);
  url.searchParams.set("size", "1");

  const response = await fetch(url);
  await throwForOrsFailure(response);
  const data = (await response.json()) as GeocodeResponse;
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (feature === undefined || coordinates === undefined) {
    throw new RoutePlannerError(`No geocoding result found for "${start}".`, "geocode_not_found");
  }

  return {
    coordinate: { lng: coordinates[0], lat: coordinates[1] },
    label: feature.properties?.label ?? feature.properties?.name ?? start,
  };
}

async function requestRoundTrip(input: {
  apiKey: string;
  coordinate: Coordinate;
  targetMeters: number;
  runType: RunType;
  avoidHills: boolean;
  seed: number;
}): Promise<OrsFeature> {
  const body = buildDirectionsBody(input);
  const response = await fetch(
    `${ORS_BASE_URL}/v2/directions/foot-walking/geojson`,
    {
      method: "POST",
      headers: {
        Authorization: input.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify(body),
    },
  );

  await throwForOrsFailure(response);
  const data = (await response.json()) as OrsDirectionsResponse;
  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (feature === undefined || coordinates === undefined) {
    throw new RoutePlannerError(
      data.error?.message ?? "No round trip route was found at that distance.",
      "no_round_trip",
    );
  }

  return feature;
}

function buildDirectionsBody(input: {
  coordinate: Coordinate;
  targetMeters: number;
  runType: RunType;
  avoidHills: boolean;
  seed: number;
}): Record<string, unknown> {
  const routeShape =
    input.runType === "speed"
      ? { points: 3, preference: "shortest" }
      : input.runType === "recovery"
        ? { points: 6, preference: "recommended" }
        : { points: 4, preference: "recommended" };

  const avoidFeatures = new Set<string>();
  if (input.runType === "recovery") {
    avoidFeatures.add("steps");
    avoidFeatures.add("ferries");
    avoidFeatures.add("fords");
  }
  if (input.avoidHills || input.runType === "speed") {
    avoidFeatures.add("steps");
  }

  return {
    coordinates: [[input.coordinate.lng, input.coordinate.lat]],
    elevation: true,
    instructions: true,
    geometry_simplify: false,
    preference: routeShape.preference,
    options: {
      round_trip: {
        length: Math.round(input.targetMeters),
        points: routeShape.points,
        seed: input.seed,
      },
      ...(avoidFeatures.size > 0
        ? { avoid_features: Array.from(avoidFeatures) }
        : {}),
    },
  };
}

async function throwForOrsFailure(response: Response): Promise<void> {
  if (response.ok) return;

  let message = `${response.status} ${response.statusText}`;
  try {
    const data = (await response.json()) as { error?: { message?: string }; message?: string };
    message = data.error?.message ?? data.message ?? message;
  } catch {
    // Keep the HTTP status text when ORS returns a non-JSON failure.
  }

  if (response.status === 429) {
    throw new RoutePlannerError(
      `OpenRouteService rate limit exceeded: ${message}`,
      "rate_limited",
    );
  }

  if (response.status === 404) {
    throw new RoutePlannerError(
      `OpenRouteService could not find a round trip for that request: ${message}`,
      "no_round_trip",
    );
  }

  throw new RoutePlannerError(`OpenRouteService request failed: ${message}`, "ors_error");
}

function buildPlannedRoute(input: {
  feature: OrsFeature;
  requestedDistanceKm: number;
  startLabel: string;
  runType: RunType;
  avoidHills: boolean;
  seed: number;
}): PlannedRoute {
  const rawCoordinates = input.feature.geometry?.coordinates ?? [];
  const coordinates = rawCoordinates.map(([lng, lat, ele]) => ({ lng, lat, ele }));
  const summary = input.feature.properties?.summary ?? {};
  const distanceMeters = summary.distance ?? sumSegmentValues(input.feature, "distance");
  const durationSeconds = summary.duration ?? sumSegmentValues(input.feature, "duration");
  const elevationGain = summary.ascent ?? calculateElevationGain(coordinates);

  if (coordinates.length < 2 || distanceMeters <= 0) {
    throw new RoutePlannerError("No usable round trip route was returned.", "no_round_trip");
  }

  const plannedRoute: PlannedRoute = {
    requested_distance_km: input.requestedDistanceKm,
    start_label: input.startLabel,
    run_type: input.runType,
    avoid_hills: input.avoidHills,
    seed: input.seed,
    coordinates,
    ors_distance_m: distanceMeters,
    ors_duration_s: durationSeconds,
    route_id: createRouteId(),
    total_distance_km: round(distanceMeters / 1000, 2),
    elevation_gain_m: Math.round(elevationGain),
    estimated_time_min: Math.max(1, Math.round(durationSeconds / 60)),
    route_map: buildRouteMap(coordinates),
    summary: "",
  };

  plannedRoute.summary = summarizeRoute(plannedRoute);
  return plannedRoute;
}

function toRouteSummary(route: PlannedRoute): RouteSummary {
  return {
    total_distance_km: route.total_distance_km,
    elevation_gain_m: route.elevation_gain_m,
    estimated_time_min: route.estimated_time_min,
    summary: route.summary,
    route_id: route.route_id,
    route_map: route.route_map,
  };
}

function summarizeRoute(route: PlannedRoute): string {
  const deltaPercent = Math.round(
    distanceDelta(route.ors_distance_m, route.requested_distance_km * 1000) * 100,
  );
  const tuning =
    route.run_type === "speed"
      ? "speed-oriented, flatter/fewer-turns request"
      : route.run_type === "recovery"
        ? "recovery-oriented request that avoids steps, ferries, and fords where possible"
        : "balanced long-run request";

  return `${route.total_distance_km.toFixed(2)} km loop from ${route.start_label}; ${route.elevation_gain_m} m gain, about ${route.estimated_time_min} min. Used a ${tuning}; result is ${deltaPercent}% from requested distance.`;
}

function parseLatLng(value: string): Coordinate | undefined {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (match === null) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function calculateElevationGain(coordinates: Coordinate[]): number {
  let gain = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1].ele;
    const current = coordinates[index].ele;
    if (previous !== undefined && current !== undefined && current > previous) {
      gain += current - previous;
    }
  }
  return gain;
}

function sumSegmentValues(feature: OrsFeature, key: "distance" | "duration"): number {
  return (
    feature.properties?.segments?.reduce(
      (total, segment) => total + (segment[key] ?? 0),
      0,
    ) ?? 0
  );
}

function toGpx(route: PlannedRoute): string {
  const points = route.coordinates
    .map((coordinate) => {
      const ele = coordinate.ele === undefined ? "" : `\n        <ele>${coordinate.ele}</ele>`;
      return `      <trkpt lat="${coordinate.lat}" lon="${coordinate.lng}">${ele}\n      </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="route-planner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(route.route_id)}</name>
    <desc>${escapeXml(route.summary)}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(route.route_id)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

function buildGoogleMapsLink(coordinates: Coordinate[]): string {
  const sampled = downsample(coordinates, 9);
  const origin = sampled[0];
  const destination = sampled[sampled.length - 1];
  const waypoints = sampled.slice(1, -1);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "walking");
  url.searchParams.set("origin", formatLatLng(origin));
  url.searchParams.set("destination", formatLatLng(destination));
  if (waypoints.length > 0) {
    url.searchParams.set("waypoints", waypoints.map(formatLatLng).join("|"));
  }
  return url.toString();
}

function downsample<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  const result: T[] = [];
  for (let index = 0; index < maxItems; index += 1) {
    const sourceIndex = Math.round((index * (items.length - 1)) / (maxItems - 1));
    result.push(items[sourceIndex]);
  }
  return result;
}

function buildRouteMap(coordinates: Coordinate[]): RouteMap {
  const points = downsample(coordinates, 240).map((coordinate) => ({
    lat: round(coordinate.lat, 6),
    lng: round(coordinate.lng, 6),
  }));
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);

  return {
    points,
    bounds: {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    },
  };
}

function formatLatLng(coordinate: Coordinate): string {
  return `${coordinate.lat},${coordinate.lng}`;
}

function distanceDelta(actualMeters: number, targetMeters: number): number {
  return Math.abs(actualMeters - targetMeters) / targetMeters;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function createRouteId(): string {
  return `route_${Date.now().toString(36)}_${randomSeed().toString(36)}`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
