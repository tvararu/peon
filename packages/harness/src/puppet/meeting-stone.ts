import { ObjectType, type WorldHandle } from "@peon/core";

const MEETING_STONE_TYPE = 23;

export async function useMeetingStone(
  handle: WorldHandle,
  name: string,
): Promise<void> {
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
        row.entity.gameObjectType === MEETING_STONE_TYPE &&
        row.position !== undefined &&
        row.distance !== null,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .at(0);
  if (!stone) throw new Error("no meeting stone nearby.");
  handle.objects.act.use(stone.entity.guid);
}
