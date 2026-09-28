export type { GearAfter, GearCtx, GearHandle } from "#harness/areas/items/tool";

import type { GearAfter, GearHandle } from "#harness/areas/items/tool";
import { BAGS, type Found } from "#harness/areas/items/tool-resolve";
import { Refusal } from "#harness/ops/refusal";

export type MoveSeen = {
  last:
    | {
        status: "confirmed" | "refused" | "no_change" | "unanswered";
        reason: string | undefined;
      }
    | undefined;
};

function requiredLevel(
  handle: GearHandle,
  itemGuid: bigint,
): number | undefined {
  const { lastInventoryError } = handle.getRewardsState();
  const packet = lastInventoryError?.packet;
  if (packet?.kind !== "error" || packet.item1 !== itemGuid) return undefined;
  return packet.detail.kind === "level"
    ? packet.detail.requiredLevel
    : undefined;
}

export function moveRefusal(
  handle: GearHandle,
  itemGuid: bigint,
  seen: MoveSeen,
): Refusal {
  const outcome = seen.last;
  const reason = outcome?.reason ?? "unanswered";
  const status = outcome?.status ?? "unanswered";
  const level =
    status === "refused" ? requiredLevel(handle, itemGuid) : undefined;
  let detail = "the server did not answer.";
  if (status === "refused") {
    const tail = level === undefined ? "" : ` (needs level ${level})`;
    detail = `the server refused: ${reason}${tail}.`;
  } else if (status === "no_change") detail = "the server reported no change.";
  return new Refusal({
    detail,
    next: BAGS,
    reason,
    status: status === "unanswered" ? "UNCONFIRMED" : "REFUSED",
  });
}

export function afterOf(
  found: Found,
  from: { bag: number; slot: number },
  init: Partial<GearAfter> & Pick<GearAfter, "do" | "item">,
): GearAfter {
  return {
    copper: 0,
    entry: found.held.item.entry,
    from,
    taken: [],
    text: undefined,
    to: undefined,
    worn: undefined,
    ...init,
  };
}
