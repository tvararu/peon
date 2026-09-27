import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const round = (n: number) => Math.round(n * 10) / 10;

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const known = () => {
    const place = handle.getPlaceState();
    return place.at === undefined ? undefined : place;
  };
  const { mapId, zone, area } = (await settle(known)) ?? handle.getPlaceState();
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
