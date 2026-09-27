import type { NamedVendorGood, VendorEvent } from "@peon/core";
import { setSelf, setUnits, unitRow } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
export const MARNIEL = 0x10n;

export function good(
  slot: number,
  itemId: number,
  name: string,
): NamedVendorGood {
  return {
    buyCount: 5,
    displayId: 0,
    extendedCost: 0,
    itemId,
    maxDurability: 0,
    name,
    price: 25,
    quality: 1,
    slot,
    stock: null,
  };
}

export function coinage(handle: MockHandle, copper: number): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    coinage: copper,
    freeSlots: 10,
  });
}

export function vendorEvent(
  handle: MockHandle,
  type: VendorEvent["type"],
  reason?: string,
): void {
  const state = handle.getVendorState();
  const lastOutcome = reason
    ? {
        action: "buy" as const,
        coinageAfter: undefined,
        moneyDelta: undefined,
        observedAt: 0,
        reason,
        request: {
          action: "buy" as const,
          answer: undefined,
          coinageBefore: undefined,
          count: 1,
          guid: MARNIEL,
          itemId: 159,
          maxPrice: 25,
          minPrice: 25,
          requestedAt: 0,
          slot: 1,
        },
        status: "refused" as const,
      }
    : state.lastOutcome;
  handle.triggerVendorEvent({ at: 0, state: { ...state, lastOutcome }, type });
}

export async function marniel(
  goods: readonly NamedVendorGood[],
  namesAfterMs = 0,
) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: MARNIEL,
      name: "Marniel Amberlight",
      relation: "friendly",
      roles: ["vendor"],
      x: 3,
      y: 0,
    }),
  ]);
  coinage(t.handle, 50_000);
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    });
  t.handle.openVendor = (guid) => {
    const state = t.handle.getVendorState();
    let named = namesAfterMs <= 0;
    if (!named)
      setTimeout(() => {
        named = true;
      }, namesAfterMs);
    const items = () =>
      goods.map((listed) =>
        named ? listed : { ...listed, name: null, quality: null },
      );
    t.handle.getVendorState = () => ({
      ...state,
      window: {
        emptyReason: undefined,
        guid,
        invalidatedReason: undefined,
        items: items(),
        openedAt: 0,
      },
    });
    vendorEvent(t.handle, "listed");
  };
  return t;
}
