import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ThemeProvider, useCallTool, useToolContext } from "mcp-use/react";

type RouteOutput = {
  total_distance_km: number;
  elevation_gain_m: number;
  estimated_time_min: number;
  summary: string;
  route_id: string;
  route_map: {
    points: Array<{ lat: number; lng: number }>;
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
  };
};

type PlannerOutput = {
  distance_km: number;
  start: string;
  run_type: RunType;
  avoid_hills: boolean;
  message: string;
};

type ExportState =
  | {
      kind: "gpx";
      path: string;
      message: string;
    }
  | {
      kind: "maps_link";
      url: string;
      message: string;
    }
  | {
      kind: "error";
      message: string;
    };

type LocationResult = {
  label: string;
  lat: number;
  lng: number;
};

type RunType = "speed" | "long" | "recovery";

const DEFAULT_START = "43.6532,-79.3832";

export default function RoutePlannerView() {
  const view = useToolContext<"open_route_planner">();
  const planRoute = useCallTool("plan_route");
  const searchLocations = useCallTool("search_locations");
  const exportRoute = useCallTool("export_route");

  const plannerDefaults = getPlannerDefaults(view);
  const initialDistance =
    typeof plannerDefaults.distance_km === "number" ? plannerDefaults.distance_km : 5;
  const initialStart = plannerDefaults.start ?? DEFAULT_START;
  const initialRunType = plannerDefaults.run_type ?? "long";
  const initialAvoidHills = Boolean(plannerDefaults.avoid_hills);

  const [distanceKm, setDistanceKm] = useState(String(initialDistance));
  const [start, setStart] = useState(initialStart);
  const [selectedStart, setSelectedStart] = useState<LocationResult | undefined>();
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationMessage, setLocationMessage] = useState<string | undefined>();
  const [runType, setRunType] = useState<RunType>(initialRunType as RunType);
  const [avoidHills, setAvoidHills] = useState(initialAvoidHills);
  const [activeRoute, setActiveRoute] = useState<RouteOutput | undefined>();
  const [exportState, setExportState] = useState<ExportState | undefined>();
  const [formError, setFormError] = useState<string | undefined>(
    view.status === "error" ? view.error.message : undefined,
  );

  const route = activeRoute;
  const isPending = view.status === "pending" || planRoute.isPending;
  const errorMessage = formError ?? planRoute.error?.message;
  const routeStart = selectedStart
    ? `${selectedStart.lat},${selectedStart.lng}`
    : start;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setExportState(undefined);

    const parsedDistance = Number(distanceKm);
    if (!Number.isFinite(parsedDistance) || parsedDistance <= 0) {
      setFormError("Enter a positive distance in kilometres.");
      return;
    }

    try {
      const result = await planRoute.callTool({
        distance_km: parsedDistance,
        start: routeStart,
        run_type: runType,
        avoid_hills: avoidHills,
      });
      setActiveRoute(result.structuredContent);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleLocationSearch() {
    setFormError(undefined);
    setLocationMessage(undefined);
    setLocationResults([]);

    try {
      const result = await searchLocations.callTool({
        query: start,
        limit: 5,
        focus_lat: 43.6532,
        focus_lng: -79.3832,
        boundary_country: "CA",
      });
      setLocationResults(result.structuredContent.results);
      if (result.structuredContent.results.length === 0) {
        setLocationMessage("No matching places found.");
      }
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function handleStartChange(value: string) {
    setStart(value);
    setSelectedStart(undefined);
    setLocationResults([]);
    setLocationMessage(undefined);
  }

  function selectLocation(result: LocationResult) {
    setSelectedStart(result);
    setStart(result.label);
    setLocationResults([]);
    setLocationMessage(undefined);
  }

  async function handleExport(format: "gpx" | "maps_link") {
    if (route === undefined) return;
    setExportState(undefined);
    try {
      const result = await exportRoute.callTool({
        route_id: route.route_id,
        format,
      });
      const output = result.structuredContent;
      setExportState(
        output.format === "gpx"
          ? {
              kind: "gpx",
              path: output.path,
              message: "GPX export is ready.",
            }
          : {
              kind: "maps_link",
              url: output.url,
              message: "Approximate Google Maps route is ready.",
            },
      );
    } catch (error) {
      setExportState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <ThemeProvider>
      <style>{styles}</style>
      <main className="route-shell">
        <section className="control-panel" aria-label="Route controls">
          <form className="route-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Distance</span>
              <div className="distance-input">
                <input
                  inputMode="decimal"
                  min="0.5"
                  step="0.1"
                  type="number"
                  value={distanceKm}
                  onChange={(event) => setDistanceKm(event.target.value)}
                />
                <span>km</span>
              </div>
            </label>

            <label className="field start-field">
              <span>Start</span>
              <div className="location-search">
                <input
                  placeholder="Search place or address"
                  type="text"
                  value={start}
                  onChange={(event) => handleStartChange(event.target.value)}
                />
                <button
                  disabled={searchLocations.isPending}
                  type="button"
                  onClick={() => void handleLocationSearch()}
                >
                  {searchLocations.isPending ? "Searching..." : "Search"}
                </button>
              </div>
            </label>

            {selectedStart ? (
              <p className="selected-location">
                Selected: {selectedStart.label}
              </p>
            ) : null}

            {locationResults.length > 0 ? (
              <div className="location-results">
                {locationResults.map((result) => (
                  <button
                    key={`${result.lat}-${result.lng}-${result.label}`}
                    type="button"
                    onClick={() => selectLocation(result)}
                  >
                    <span>{result.label}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {locationMessage ? <p className="inline-note">{locationMessage}</p> : null}

            <fieldset className="segmented">
              <legend>Run type</legend>
              {(["speed", "long", "recovery"] as const).map((option) => (
                <label key={option}>
                  <input
                    checked={runType === option}
                    name="run-type"
                    type="radio"
                    value={option}
                    onChange={() => setRunType(option)}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>

            <label className="toggle">
              <input
                checked={avoidHills}
                type="checkbox"
                onChange={(event) => setAvoidHills(event.target.checked)}
              />
              <span>Avoid hills</span>
            </label>

            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? "Planning..." : "Plan route"}
            </button>
          </form>

          {errorMessage ? <p className="status error">{errorMessage}</p> : null}
        </section>

        <section className="map-panel" aria-label="Route map">
          <InlineRouteMap route={route} pending={isPending} />
        </section>

        {route ? (
          <section className="summary-panel" aria-label="Route summary">
            <div className="stats-grid">
              <Metric label="Distance" value={`${route.total_distance_km.toFixed(2)} km`} />
              <Metric label="Gain" value={`${route.elevation_gain_m} m`} />
              <Metric label="Time" value={`${route.estimated_time_min} min`} />
            </div>
            <p className="summary-text">{route.summary}</p>
            <div className="actions">
              <button
                disabled={exportRoute.isPending}
                type="button"
                onClick={() => void handleExport("gpx")}
              >
                Export GPX
              </button>
              <button
                disabled={exportRoute.isPending}
                type="button"
                onClick={() => void handleExport("maps_link")}
              >
                Maps link
              </button>
            </div>
            {exportState ? <ExportResult state={exportState} /> : null}
          </section>
        ) : null}
      </main>
    </ThemeProvider>
  );
}

function getPlannerDefaults(
  view: ReturnType<typeof useToolContext<"open_route_planner">>,
): Partial<PlannerOutput> {
  if (view.status === "ready") return view.toolOutput;
  return view.toolInput ?? {};
}

function ExportResult({ state }: { state: ExportState }) {
  if (state.kind === "error") {
    return <p className="status error">{state.message}</p>;
  }

  if (state.kind === "maps_link") {
    return (
      <div className="status export-result">
        <span>{state.message}</span>
        <a href={state.url} rel="noreferrer" target="_blank">
          Open in Google Maps
        </a>
      </div>
    );
  }

  return (
    <div className="status export-result">
      <span>{state.message}</span>
      <code>{state.path}</code>
    </div>
  );
}

function InlineRouteMap({
  route,
  pending,
}: {
  route: RouteOutput | undefined;
  pending: boolean;
}) {
  const path = useMemo(() => (route ? toSvgPath(route) : ""), [route]);
  const firstPoint = route?.route_map.points[0];

  if (route === undefined) {
    return (
      <div className="empty-map">
        <div className="pulse-ring" />
        <p>{pending ? "Finding a round trip..." : "Plan a route to draw it here."}</p>
      </div>
    );
  }

  return (
    <svg className="route-map" role="img" viewBox="0 0 640 360">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect className="map-bg" width="640" height="360" rx="6" />
      <rect className="map-grid" width="640" height="360" rx="6" fill="url(#grid)" />
      <path className="route-shadow" d={path} />
      <path className="route-line" d={path} />
      {firstPoint ? <StartMarker route={route} point={firstPoint} /> : null}
    </svg>
  );
}

function StartMarker({
  route,
  point,
}: {
  route: RouteOutput;
  point: { lat: number; lng: number };
}) {
  const { x, y } = projectPoint(point, route.route_map.bounds);
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="start-dot-outer" r="9" />
      <circle className="start-dot" r="4" />
    </g>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toSvgPath(route: RouteOutput): string {
  return route.route_map.points
    .map((point, index) => {
      const { x, y } = projectPoint(point, route.route_map.bounds);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function projectPoint(
  point: { lat: number; lng: number },
  bounds: RouteOutput["route_map"]["bounds"],
) {
  const padding = 28;
  const width = 640 - padding * 2;
  const height = 360 - padding * 2;
  const lngSpan = Math.max(0.000001, bounds.east - bounds.west);
  const latSpan = Math.max(0.000001, bounds.north - bounds.south);

  return {
    x: padding + ((point.lng - bounds.west) / lngSpan) * width,
    y: padding + ((bounds.north - point.lat) / latSpan) * height,
  };
}

const styles = `
.route-shell {
  color: #152033;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(220px, 0.9fr) minmax(320px, 1.35fr);
  padding: 14px;
}
.control-panel,
.summary-panel {
  background: #ffffff;
  border: 1px solid #d9e0ea;
  border-radius: 8px;
  padding: 14px;
}
.control-panel {
  align-self: start;
}
.route-form {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.field span,
.segmented legend,
.toggle {
  color: #4c5a6f;
  font-size: 13px;
  font-weight: 650;
}
.field input,
.distance-input,
.segmented,
.primary-button,
.actions button {
  border-radius: 7px;
}
.field input {
  background: #f8fafc;
  border: 1px solid #cfd8e5;
  color: #152033;
  font: inherit;
  min-width: 0;
  padding: 10px 11px;
}
.distance-input {
  align-items: center;
  background: #f8fafc;
  border: 1px solid #cfd8e5;
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: hidden;
}
.distance-input input {
  border: 0;
  border-radius: 0;
}
.distance-input span {
  padding-right: 11px;
}
.location-search {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}
.location-search button,
.location-results button {
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
}
.location-search button {
  background: #edf2f7;
  color: #18243a;
  font-weight: 750;
  padding: 0 12px;
}
.location-search button:disabled {
  cursor: progress;
  opacity: 0.68;
}
.location-results {
  border: 1px solid #d9e0ea;
  border-radius: 7px;
  display: grid;
  overflow: hidden;
}
.location-results button {
  background: #ffffff;
  color: #25354d;
  min-height: 38px;
  padding: 9px 10px;
  text-align: left;
}
.location-results button + button {
  border-top: 1px solid #d9e0ea;
}
.location-results button:hover {
  background: #f2f7f5;
}
.location-results span {
  display: block;
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.selected-location,
.inline-note {
  color: #4c5a6f;
  font-size: 12px;
  line-height: 1.35;
  margin: -4px 0 0;
  overflow-wrap: anywhere;
}
.selected-location {
  color: #0f6b55;
  font-weight: 700;
}
.segmented {
  border: 0;
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
  padding: 0;
}
.segmented legend {
  grid-column: 1 / -1;
  margin-bottom: 2px;
}
.segmented label {
  min-width: 0;
}
.segmented input {
  opacity: 0;
  position: absolute;
}
.segmented span {
  background: #edf2f7;
  border: 1px solid #d7e0ec;
  border-radius: 7px;
  color: #34445b;
  display: block;
  font-size: 12px;
  overflow: hidden;
  padding: 9px 6px;
  text-align: center;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}
.segmented input:checked + span {
  background: #18243a;
  border-color: #18243a;
  color: #ffffff;
}
.toggle {
  align-items: center;
  display: flex;
  gap: 8px;
}
.toggle input {
  height: 17px;
  width: 17px;
}
.primary-button,
.actions button {
  border: 0;
  cursor: pointer;
  font: inherit;
  font-weight: 750;
  min-height: 40px;
  padding: 10px 13px;
}
.primary-button {
  background: #18243a;
  color: #ffffff;
}
.primary-button:disabled,
.actions button:disabled {
  cursor: progress;
  opacity: 0.68;
}
.map-panel {
  border: 1px solid #d9e0ea;
  border-radius: 8px;
  min-height: 300px;
  overflow: hidden;
}
.route-map {
  color: rgba(42, 57, 78, 0.18);
  display: block;
  height: 100%;
  min-height: 300px;
  width: 100%;
}
.map-bg {
  fill: #eef3f1;
}
.map-grid {
  color: rgba(64, 80, 103, 0.18);
}
.route-shadow {
  fill: none;
  stroke: rgba(8, 19, 34, 0.22);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 12;
}
.route-line {
  fill: none;
  stroke: #0f8b6d;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 5;
}
.start-dot-outer {
  fill: #ffffff;
  stroke: #18243a;
  stroke-width: 3;
}
.start-dot {
  fill: #18243a;
}
.empty-map {
  align-items: center;
  background: #eef3f1;
  color: #4c5a6f;
  display: grid;
  gap: 12px;
  justify-items: center;
  min-height: 300px;
  padding: 16px;
  text-align: center;
}
.pulse-ring {
  border: 5px solid #0f8b6d;
  border-radius: 999px;
  height: 52px;
  opacity: 0.8;
  width: 52px;
}
.summary-panel {
  display: grid;
  gap: 12px;
  grid-column: 1 / -1;
}
.stats-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, 1fr);
}
.metric {
  background: #f8fafc;
  border: 1px solid #d9e0ea;
  border-radius: 7px;
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 10px;
}
.metric span {
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}
.metric strong {
  color: #152033;
  font-size: 18px;
  overflow-wrap: anywhere;
}
.summary-text,
.status {
  color: #34445b;
  font-size: 14px;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}
.status {
  background: #eef6f3;
  border: 1px solid #cde3dc;
  border-radius: 7px;
  padding: 10px;
}
.export-result {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
}
.export-result a {
  background: #0f8b6d;
  border-radius: 7px;
  color: #ffffff;
  font-weight: 750;
  padding: 9px 12px;
  text-decoration: none;
}
.export-result code {
  background: #ffffff;
  border: 1px solid #cde3dc;
  border-radius: 6px;
  color: #34445b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
  padding: 7px;
}
.status.error {
  background: #fff3f0;
  border-color: #f3c8bd;
  color: #8a2f1c;
  margin-top: 12px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions button {
  background: #edf2f7;
  color: #18243a;
}
@media (max-width: 720px) {
  .route-shell {
    grid-template-columns: 1fr;
    padding: 10px;
  }
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
`;
