import { z } from "zod";
import { formatPlannerError } from "./ors.js";

export const runTypeSchema = z.enum(["speed", "long", "recovery"]);
export const exportFormatSchema = z.enum(["gpx", "maps_link"]);

export const openRoutePlannerInputSchema = z.object({
  distance_km: z
    .number()
    .positive()
    .optional()
    .default(5)
    .describe("Initial distance to prefill in kilometres."),
  start: z
    .string()
    .optional()
    .default("43.6532,-79.3832")
    .describe('Initial start address or coordinates to prefill, such as "CN Tower" or "lat,lng".'),
  run_type: runTypeSchema
    .optional()
    .default("long")
    .describe("Initial route style to preselect."),
  avoid_hills: z
    .boolean()
    .optional()
    .default(false)
    .describe("Initial avoid-hills toggle state."),
});

export const openRoutePlannerOutputSchema = z.object({
  distance_km: z.number(),
  start: z.string(),
  run_type: runTypeSchema,
  avoid_hills: z.boolean(),
  message: z.string(),
});

export const searchLocationsInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe("Place, landmark, address, or neighbourhood to search for."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .default(5)
    .describe("Maximum number of location results to return."),
  focus_lat: z
    .number()
    .optional()
    .default(43.6532)
    .describe("Latitude used to bias and sort search results by proximity."),
  focus_lng: z
    .number()
    .optional()
    .default(-79.3832)
    .describe("Longitude used to bias and sort search results by proximity."),
  boundary_country: z
    .string()
    .optional()
    .default("CA")
    .describe("Optional ISO-like country filter for location search, defaulting to Canada."),
});

export const searchLocationsOutputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      label: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
  ),
});

export const planRouteInputSchema = z.object({
  distance_km: z.number().positive().describe("Requested route distance in kilometres."),
  start: z.string().min(1).describe('Start address or coordinates as "lat,lng".'),
  run_type: runTypeSchema
    .optional()
    .default("long")
    .describe("Route style: speed, long, or recovery."),
  avoid_hills: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, request flatter walking-friendly routing where ORS supports it."),
});

export const planRouteOutputSchema = z.object({
  total_distance_km: z.number().describe("Total returned route distance in kilometres."),
  elevation_gain_m: z.number().describe("Estimated elevation gain in metres."),
  estimated_time_min: z.number().describe("Estimated walking/running time in minutes."),
  summary: z.string().describe("Short human-readable route summary."),
  route_id: z.string().describe("Identifier for exporting this cached route."),
  route_map: z
    .object({
      points: z
        .array(
          z.object({
            lat: z.number(),
            lng: z.number(),
          }),
        )
        .describe("Downsampled route coordinates for inline map rendering."),
      bounds: z.object({
        north: z.number(),
        south: z.number(),
        east: z.number(),
        west: z.number(),
      }),
    })
    .describe("Route geometry for displaying the route directly in chat."),
});

export const exportRouteInputSchema = z.object({
  route_id: z.string().min(1).describe("Route identifier returned by plan_route."),
  format: exportFormatSchema
    .optional()
    .default("gpx")
    .describe("Export format: gpx or maps_link."),
});

export const exportRouteOutputSchema = z.union([
  z.object({
    route_id: z.string(),
    format: z.literal("gpx"),
    path: z.string(),
    message: z.string(),
  }),
  z.object({
    route_id: z.string(),
    format: z.literal("maps_link"),
    url: z.string(),
    message: z.string(),
  }),
]);

export function toErrorResult(error: unknown) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: formatPlannerError(error) }],
  };
}
