export type RunType = "speed" | "long" | "recovery";
export type ExportFormat = "gpx" | "maps_link";

export type Coordinate = {
  lat: number;
  lng: number;
  ele?: number;
};

export type RouteMap = {
  points: Array<{
    lat: number;
    lng: number;
  }>;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
};

export type RouteSummary = {
  total_distance_km: number;
  elevation_gain_m: number;
  estimated_time_min: number;
  summary: string;
  route_id: string;
  route_map: RouteMap;
};

export type LocationSearchResult = {
  label: string;
  lat: number;
  lng: number;
};

export type LocationSearchResponse = {
  query: string;
  results: LocationSearchResult[];
};

export type PlannedRoute = RouteSummary & {
  requested_distance_km: number;
  start_label: string;
  run_type: RunType;
  avoid_hills: boolean;
  seed: number;
  coordinates: Coordinate[];
  ors_distance_m: number;
  ors_duration_s: number;
};

export type ExportRouteResult =
  | {
      route_id: string;
      format: "gpx";
      path: string;
      message: string;
    }
  | {
      route_id: string;
      format: "maps_link";
      url: string;
      message: string;
    };
