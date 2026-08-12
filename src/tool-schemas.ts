import { z } from "zod";
import { formatPlannerError } from "./ors.js";

export const runTypeSchema = z.enum(["speed", "long", "recovery"]);
export const exportFormatSchema = z.enum(["gpx", "maps_link"]);

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
