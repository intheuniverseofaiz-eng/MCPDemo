import { formatPlannerError, planRunningRoute } from "../src/ors.js";

const [, , distanceArg = "5", start = "43.6532,-79.3832"] = process.argv;
const distance_km = Number(distanceArg);

try {
  const result = await planRunningRoute({
    distance_km,
    start,
    run_type: "long",
    avoid_hills: false,
  });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(formatPlannerError(error));
  process.exitCode = 1;
}
