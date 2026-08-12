import { MCPServer } from "mcp-use";
import { exportRunningRoute, planRunningRoute, searchLocations } from "./src/ors.js";
import {
  exportRouteInputSchema,
  exportRouteOutputSchema,
  openRoutePlannerInputSchema,
  openRoutePlannerOutputSchema,
  planRouteInputSchema,
  planRouteOutputSchema,
  searchLocationsInputSchema,
  searchLocationsOutputSchema,
  toErrorResult,
} from "./src/tool-schemas.js";

const server = new MCPServer({
  name: "route-planner",
  title: "Route Planner",
  version: "1.0.0",
  description: "Generate and export running routes with OpenRouteService.",
  instructions:
    "When the user asks to plan, make, or create a running route in chat, use open_route_planner to open the interactive form first. Use plan_route after the user provides details or submits the form. Use export_route with the returned route_id for GPX or an approximate Google Maps walking link.",
  websiteUrl: "https://openrouteservice.org",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],

  // The MCP server is by default served at /mcp, to customise
  // basePath: "/mcp",

  // mcp-use has 1 line adapter for OAuth, import from mcp-use/oauth/*
  // oauth: oauthClerkProvider(), // zero-config via MCP_USE_OAUTH_CLERK_FRONTEND_API_URL, import from mcp-use/oauth/*

  // When OAuth is on, the HTML landing page (/mcp) is protected by default, set to true to keep the landing page public while /mcp stays bearer-protected.
  // publicLandingPage: true,
});

export const openRoutePlanner = server.tool(
  {
    name: "open_route_planner",
    title: "Open route planner",
    description:
      "Open an interactive in-chat route planner with distance/start fields, run controls, an inline map, and export actions. Use this when a user says to plan a run or make a running route, especially before all details are known.",
    inputSchema: openRoutePlannerInputSchema,
    outputSchema: openRoutePlannerOutputSchema,
    view: {
      name: "route-planner",
      description: "Interactive running route planner with an inline route map",
      prefersBorder: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  async (input) => {
    const data = {
      ...input,
      message: "Route planner ready. Fill in the fields and press Plan route.",
    };
    return {
      content: [{ type: "text", text: data.message }],
      structuredContent: data,
    };
  },
);

export const planRoute = server.tool(
  {
    name: "plan_route",
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
  async (input) => {
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

export const searchLocationsTool = server.tool(
  {
    name: "search_locations",
    title: "Search locations",
    description:
      "Search for a start location by place name, landmark, address, or lat,lng. Returns selectable coordinates for the route planner.",
    inputSchema: searchLocationsInputSchema,
    outputSchema: searchLocationsOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (input) => {
    try {
      const data = await searchLocations(input);
      return {
        content: [
          {
            type: "text",
            text: data.results.map((result) => result.label).join("\n"),
          },
        ],
        structuredContent: data,
      };
    } catch (error) {
      return toErrorResult(error);
    }
  },
);

export const exportRoute = server.tool(
  {
    name: "export_route",
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
  async (input) => {
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

export default server;
