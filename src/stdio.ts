import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import {
  exportRouteInputSchema,
  exportRouteOutputSchema,
  planRouteInputSchema,
  planRouteOutputSchema,
  toErrorResult,
} from "./tool-schemas.js";
import { exportRunningRoute, planRunningRoute } from "./ors.js";

serveStdio(() => {
  const server = new McpServer({
    name: "route-planner",
    version: "1.0.0",
  });

  server.registerTool(
    "plan_route",
    {
      title: "Plan running route",
      description:
        "Generate a running loop of roughly the requested distance from a start address or lat,lng.",
      inputSchema: planRouteInputSchema,
      outputSchema: planRouteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: z.infer<typeof planRouteInputSchema>) => {
      try {
        const data = await planRunningRoute(input);
        return {
          content: [{ type: "text", text: data.summary }],
          structuredContent: data,
        };
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "export_route",
    {
      title: "Export running route",
      description: "Export a cached planned route as GPX or an approximate Google Maps walking link.",
      inputSchema: exportRouteInputSchema,
      outputSchema: exportRouteOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input: z.infer<typeof exportRouteInputSchema>) => {
      try {
        const data = await exportRunningRoute(input);
        return {
          content: [{ type: "text", text: data.message }],
          structuredContent: data,
        };
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  return server;
});
