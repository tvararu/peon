import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const round = (n: number) => Math.round(n * 10) / 10;

function run({ handle }: FlowContext): Json {
  const { mapId, zone, area } = handle.getPlaceState();
  const pose = handle.getControlState().pose;
  const at = pose && { x: round(pose.x), y: round(pose.y), z: round(pose.z) };
  return {
    area: area ?? null,
    mapId: mapId ?? null,
    pose: at ?? null,
    zone: zone ?? null,
  };
}

export const flow: ProbeFlow = {
  name: "login",
  run,
  usage: "--flow login: report where the character stands after login.",
};
