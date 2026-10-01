import { named } from "#harness/areas/items/tool-resolve";
import {
  afterOf,
  type GearAfter,
  type GearCtx,
  moveRefusal,
} from "#harness/areas/items/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

export async function runSocket(
  ctx: GearCtx,
  item: string,
  gems: string | undefined,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "equipment",
    "backpack",
    "bag_item",
  ]);
  const gemNames = (gems ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
  if (gemNames.length === 0) throw new Error("socket needs at least one gem");
  const guids: bigint[] = [];
  for (const name of gemNames)
    guids.push(
      named(handle.getInventoryState(), name, ["backpack", "bag_item"]).held
        .guid,
    );
  const outcome = await rt.mutex.run(() =>
    handle.items.act.socket(found.held.guid, guids),
  );
  if (outcome.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, { last: outcome });
  return result("DONE", {
    after: afterOf(
      found,
      { bag: found.held.bag, slot: found.held.slot },
      {
        do: "socket",
        item: found.label,
      },
    ),
    detail: `Socketed ${gemNames.join(", ")} into ${found.label}.`,
  });
}
