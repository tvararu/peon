import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const MAX_STEPS = 12;
const STEP_YARDS = 20;

async function run({ handle, args }: FlowContext): Promise<Json> {
  const point = { x: Number(args["x"]), y: Number(args["y"]) };
  if (!(Number.isFinite(point.x) && Number.isFinite(point.y)))
    throw new Error("travel-walk needs --arg x=<n> --arg y=<n>.");
  const zRaw = args["z"];
  const z = zRaw === undefined || zRaw === "" ? undefined : Number(zRaw);
  if (z !== undefined && !Number.isFinite(z))
    throw new Error("travel-walk needs --arg z=<n>, not the text given.");
  const start = handle.getControlState().pose;
  if (!start) throw new Error("travel-walk needs a world pose: log in first.");
  const target = { x: point.x, y: point.y, z: z ?? start.z };
  const route: {
    status: string;
    traveled: number;
    x: number;
    y: number;
    z: number;
  }[] = [];
  let traveled = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const walked = await handle.walkTowardPoint(target, STEP_YARDS);
    traveled += walked.traveled;
    const end = walked.pose;
    route.push({
      status: walked.status,
      traveled: walked.traveled,
      x: end.x,
      y: end.y,
      z: end.z,
    });
    if (walked.status !== "completed" && walked.traveled === 0)
      return {
        outcome: { reason: walked.reason ?? null, status: walked.status },
        route,
        traveled,
      };
    if (Math.hypot(end.x - point.x, end.y - point.y) <= 2)
      return { outcome: { status: "arrived" }, route, traveled };
  }
  return { outcome: { status: "steps_exhausted" }, route, traveled };
}

export const flow: ProbeFlow = {
  name: "travel-walk",
  run,
  usage:
    "--flow travel-walk --arg x=<n> --arg y=<n> [--arg z=<n>]: walk toward the point in 20 yd steps on the server-planned ground route and report each step end with the total walked.",
};
