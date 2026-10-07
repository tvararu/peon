import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const place = await settle(() => {
    const state = handle.getPlaceState();
    const pose = handle.getControlState().pose;
    return state.mapId === undefined || pose === undefined
      ? undefined
      : { mapId: state.mapId, pose };
  });
  if (!place) throw new Error("guard-denied found no map or position.");
  const { mapId, pose } = place;
  const outcome = await handle.guard.act.worldTeleport({
    map: mapId,
    orientation: pose.orientation ?? 0,
    x: pose.x,
    y: pose.y,
    z: pose.z,
  });
  const { active, requests, firstSize } = handle.guard.state().warden;
  return {
    mapId,
    outcome,
    warden: { active, firstSize: firstSize ?? null, requests },
  };
}

export const flow: ProbeFlow = {
  name: "guard-denied",
  run,
  usage:
    "--flow guard-denied: send CMSG_WORLD_TELEPORT to the character's own spot and report whether the server denied it.",
};
