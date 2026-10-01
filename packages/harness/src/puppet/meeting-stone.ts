import { type NearbyRow, ObjectType, type WorldHandle } from "@peon/core";

const MEETING_STONE_TYPE = 23;
const SUMMONING_PORTAL_ENTRY = 179_944;
const SUMMONING_PORTAL_TYPE = 18;

function nearestGameObject(
  handle: WorldHandle,
  match: (type: number, entry: number | undefined) => boolean,
): NearbyRow | undefined {
  return handle
    .queryNearby()
    .filter((row) => {
      const { entity } = row;
      if (row.self || entity.objectType !== ObjectType.GAMEOBJECT) return false;
      if (!("gameObjectType" in entity)) return false;
      return (
        match(
          entity.gameObjectType,
          "entry" in entity ? entity.entry : undefined,
        ) &&
        row.position !== undefined &&
        row.distance !== null
      );
    })
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .at(0);
}

export function useMeetingStone(handle: WorldHandle, name: string): void {
  const wanted = name.toLowerCase();
  const member = handle
    .getPartyState()
    .members.find((entry) => entry.name.toLowerCase() === wanted);
  if (!member) throw new Error(`${name} is not in the group.`);
  handle.selectTarget(member.guid);
  const stone = nearestGameObject(
    handle,
    (type) => type === MEETING_STONE_TYPE,
  );
  if (!stone) throw new Error("no meeting stone nearby.");
  const outcome = handle.objects.act.use(stone.entity.guid);
  if ("ok" in outcome && !outcome.ok)
    throw new Error(`the meeting stone was refused: ${outcome.reason}.`);
}

export function useSummoningPortal(handle: WorldHandle): void {
  const portal = nearestGameObject(
    handle,
    (type, entry) =>
      type === SUMMONING_PORTAL_TYPE && entry === SUMMONING_PORTAL_ENTRY,
  );
  if (!portal) throw new Error("no summoning portal nearby.");
  const outcome = handle.objects.act.use(portal.entity.guid);
  if ("ok" in outcome && !outcome.ok)
    throw new Error(`the summoning portal was refused: ${outcome.reason}.`);
}
