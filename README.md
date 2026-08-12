# route-planner

An MCP server that generates running loops with OpenRouteService, renders the route inline as an MCP App, and exports cached routes as GPX or approximate Google Maps walking links.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set your OpenRouteService key. The server requires `ORS_API_KEY` and does not fall back to another router.

   ```bash
   export ORS_API_KEY="your-openrouteservice-key"
   ```

3. Confirm the ORS round-trip call works standalone:

   ```bash
   npm run probe:ors -- 5 "43.6532,-79.3832"
   ```

4. Run as an mcp-use app for local HTTP testing:

   ```bash
   npm run dev
   ```

   The MCP endpoint is `http://localhost:3000/mcp`.

5. Run with stdio transport for local MCP clients:

   ```bash
   npm run stdio
   ```

## Tools

### open_route_planner

Opens the in-chat route planner without requiring all route details first. Use this for prompts like "plan a run for me" or "make a running route" so the user can fill in the distance, search/select a start location, choose run type, and set avoid-hills directly in the MCP App.

Example arguments:

```json
{
  "distance_km": 5,
  "start": "CN Tower",
  "run_type": "long",
  "avoid_hills": false
}
```

### plan_route

Generates a foot-walking round trip with OpenRouteService. It retries with up to four random seeds and keeps the closest route if none are within 15% of the requested distance.

The interactive planner calls this tool after the user presses **Plan route**. Results include an inline SVG route map and export buttons. The **Maps link** action displays a clean **Open in Google Maps** link at the bottom instead of a long raw URL.

### search_locations

Searches for a start location by place name, landmark, address, or `lat,lng`. The interactive planner uses this for the **Search** button beside the Start field, then plans from the selected coordinates.

Example arguments:

```json
{
  "query": "CN Tower",
  "limit": 5,
  "focus_lat": 43.6532,
  "focus_lng": -79.3832,
  "boundary_country": "CA"
}
```

Example arguments:

```json
{
  "distance_km": 8,
  "start": "Toronto City Hall",
  "run_type": "long",
  "avoid_hills": false
}
```

Returns:

```json
{
  "total_distance_km": 8.12,
  "elevation_gain_m": 42,
  "estimated_time_min": 73,
  "summary": "8.12 km loop from Toronto City Hall; 42 m gain, about 73 min...",
  "route_id": "route_...",
  "route_map": {
    "points": [{ "lat": 43.6532, "lng": -79.3832 }],
    "bounds": {
      "north": 43.66,
      "south": 43.65,
      "east": -79.37,
      "west": -79.39
    }
  }
}
```

### export_route

Exports one of the last 20 planned routes from memory.

Example GPX arguments:

```json
{
  "route_id": "route_...",
  "format": "gpx"
}
```

Example Google Maps link arguments:

```json
{
  "route_id": "route_...",
  "format": "maps_link"
}
```

Google Maps links are approximations because the URL uses a downsampled route with at most 9 waypoints.
