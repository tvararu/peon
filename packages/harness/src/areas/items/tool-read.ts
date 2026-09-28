import { BAGS, named } from "#harness/areas/items/tool-resolve";
import {
  afterOf,
  type GearAfter,
  type GearCtx,
  moveRefusal,
} from "#harness/areas/items/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";

export async function runRead(
  ctx: GearCtx,
  item: string,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const outcome_ = await rt.mutex.run(() => handle.items.act.read(from));
  if (outcome_.status !== "ok")
    throw new Refusal({
      detail:
        outcome_.status === "unanswered"
          ? "the server did not answer."
          : `the server refused: ${outcome_.reason ?? "read_item_failed"}.`,
      next: BAGS,
      reason: outcome_.reason ?? outcome_.status,
      status: outcome_.status === "unanswered" ? "UNCONFIRMED" : "REFUSED",
    });
  const text = await rt.mutex.run(() =>
    handle.items.act.queryText(found.held.guid),
  );
  return result("DONE", {
    after: afterOf(found, from, {
      do: "read",
      item: found.label,
      text,
    }),
    detail: text
      ? `Read ${found.label}: ${text}.`
      : `Read ${found.label} (no text).`,
  });
}

export async function runAmmo(
  ctx: GearCtx,
  item: string,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const outcome_ = await rt.mutex.run(() =>
    handle.items.act.setAmmo(found.held.item.entry ?? 0),
  );
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  return result("DONE", {
    after: afterOf(
      found,
      { bag: found.held.bag, slot: found.held.slot },
      {
        do: "ammo",
        item: found.label,
      },
    ),
    detail: `${found.label} loaded.`,
  });
}
