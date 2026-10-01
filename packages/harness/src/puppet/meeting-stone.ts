import { ObjectType, type WorldHandle } from "@peon/core";

const MEETING_STONE_TYPE = 23;

export function useMeetingStone(handle: WorldHandle, name: string): void {
  const wanted = name.toLowerCase();
  const member = handle
    .getPartyState()
    .members.find((entry) => entry.name.toLowerCase() === wanted);
  if (!member) throw new Error(`${name} is not in the group.`);
  handle.selectTarget(member.guid);
  const stone = handle
    .queryNearby()
    .filter(
      (row) =>
        !row.self &&
        row.entity.objectType === ObjectType.GAMEOBJECT &&
        "gameObjectType" in row.entity &&
        row.entity.gameObjectType === MEETING_STONE_TYPE &&
        row.position !== undefined &&
        row.distance !== null,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .at(0);
  if (!stone) throw new Error("no meeting stone nearby.");
  const outcome = handle.objects.act.use(stone.entity.guid);
  if ("ok" in outcome && !outcome.ok)
    throw new Error(`the meeting stone was refused: ${outcome.reason}.`);
}
