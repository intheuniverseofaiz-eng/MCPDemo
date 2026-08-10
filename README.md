# route-planner

An MCP server that generates running loops with OpenRouteService and exports cached routes as GPX or approximate Google Maps walking links.

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

### plan_route

Generates a foot-walking round trip with OpenRouteService. It retries with up to four random seeds and keeps the closest route if none are within 15% of the requested distance.

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
  "route_id": "route_..."
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
