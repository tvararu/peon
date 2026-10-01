import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import { findItem } from "#wow/areas/items/moves";
import {
  buildEquipmentSetDelete,
  buildEquipmentSetSave,
  buildEquipmentSetUse,
  checkSetFields,
  EQUIPMENT_SLOT_COUNT,
  type EquipmentSetUseEntry,
  IGNORED_SLOT,
} from "#wow/areas/items/protocol-sets";
import type {
  SaveOutcome,
  SaveRequest,
  UseOutcome,
} from "#wow/areas/items/sets";
import type { ItemsStore } from "#wow/areas/items/store";
import type { InventoryState } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";

export const SET_ANSWER_MS = 5000;

export type SetActs = {
  saveSet: (init: {
    index: number;
    name: string;
    icon?: string;
    items?: readonly bigint[];
  }) => Promise<SaveOutcome>;
  useSet: (index: number) => Promise<UseOutcome>;
  deleteSet: (index: number) => Promise<{ index: number; setGuid: bigint }>;
};

type Env = { ctx: AreaRuntimeCtx<ItemsEvent>; store: ItemsStore };

const SAVE_SETTLED = new Set<ItemsEvent["type"]>(["set_saved"]);
const USE_SETTLED = new Set<ItemsEvent["type"]>(["set_used"]);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function inWorld({ ctx, store }: Env): InventoryState {
  if (!ctx.selfGuid() || store.inventory().status === "unknown")
    throw new Error("the character is not in world");
  if (store.life() !== "alive")
    throw new Error(`the character is ${store.life()}`);
  return store.inventory();
}

function wornGuids(inventory: InventoryState): bigint[] {
  return Array.from({ length: EQUIPMENT_SLOT_COUNT }, (_, slot) => {
    const held = inventory.slots.find(
      (entry) =>
        entry.status === "occupied" &&
        entry.bag === 255 &&
        entry.slot === slot &&
        entry.region === "equipment",
    );
    return held?.status === "occupied" ? held.guid : 0n;
  });
}

function checkItems(inventory: InventoryState, items: readonly bigint[]): void {
  if (items.length !== EQUIPMENT_SLOT_COUNT)
    throw new Error(
      `an equipment set holds ${EQUIPMENT_SLOT_COUNT} slots, got ${items.length}`,
    );
  items.forEach((guid, slot) => {
    if (guid === 0n || guid === IGNORED_SLOT) return;
    const held = inventory.slots.find(
      (entry) =>
        entry.status === "occupied" &&
        entry.bag === 255 &&
        entry.slot === slot &&
        entry.region === "equipment",
    );
    const worn = held?.status === "occupied" ? held.guid : 0n;
    if (worn !== guid)
      throw new Error(`item ${guid} is not equipped in slot ${slot}`);
  });
}

function positionsOf(
  inventory: InventoryState,
  items: readonly bigint[],
): EquipmentSetUseEntry[] {
  return items.map((guid) => {
    if (guid === 0n || guid === IGNORED_SLOT) return { bag: 0, guid, slot: 0 };
    const held = findItem(inventory, guid);
    if (!held) return { bag: 0, guid: 0n, slot: 0 };
    if (held.bag === 255 && held.slot <= 18)
      return { bag: 255, guid, slot: held.slot };
    return { bag: held.bag, guid, slot: held.slot };
  });
}

function lastSave({ store }: Env): SaveOutcome {
  const last = store.snapshot().sets.lastSave;
  if (!last) throw new Error("the save did not settle");
  return last;
}

function lastUse({ store }: Env): UseOutcome {
  const last = store.snapshot().sets.lastUse;
  if (!last) throw new Error("the use did not settle");
  return last;
}

async function saveSet(
  env: Env,
  init: {
    index: number;
    name: string;
    icon?: string;
    items?: readonly bigint[];
  },
): Promise<SaveOutcome> {
  const { ctx, store } = env;
  const inventory = inWorld(env);
  if (store.snapshot().sets.savePending)
    throw new Error("a set save is already pending");
  const icon = init.icon ?? "";
  checkSetFields(init.index, init.name, icon);
  const items = init.items ? [...init.items] : wornGuids(inventory);
  checkItems(inventory, items);
  const known = store
    .snapshot()
    .sets.sets.find((set) => set.index === init.index);
  const request: SaveRequest = {
    kind: known ? "update" : "create",
    index: init.index,
    name: init.name,
    items,
    requestedAt: ctx.now(),
  };
  const settled = ctx.until((event) => SAVE_SETTLED.has(event.type), {
    timeoutMs: SET_ANSWER_MS,
  });
  store.beginSave(request, icon);
  ctx.send(
    GameOpcode.CMSG_EQUIPMENT_SET_SAVE,
    buildEquipmentSetSave({
      icon,
      index: request.index,
      items,
      name: init.name,
      setGuid: known?.setGuid ?? 0n,
    }),
  );
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      store.abandonSave();
      throw error;
    }
    if (request.kind === "update") store.confirmUpdated(init.name, icon);
    else store.expireSave();
  }
  return lastSave(env);
}

async function useSet(env: Env, index: number): Promise<UseOutcome> {
  const { ctx, store } = env;
  const inventory = inWorld(env);
  if (store.snapshot().sets.usePending)
    throw new Error("a set use is already pending");
  const snap = store.snapshot().sets;
  const set = snap.sets.find((entry) => entry.index === index);
  if (!set)
    return Promise.reject(new Error(`no set is stored at index ${index}`));
  const worn = wornGuids(inventory);
  const request = {
    index,
    items: [...set.items],
    outgoing: set.items.map((guid, slot) =>
      guid === IGNORED_SLOT ? 0n : (worn[slot] ?? 0n),
    ),
    requestedAt: ctx.now(),
  };
  const settled = ctx.until((event) => USE_SETTLED.has(event.type), {
    timeoutMs: SET_ANSWER_MS,
  });
  store.beginUse(request);
  ctx.send(
    GameOpcode.CMSG_EQUIPMENT_SET_USE,
    buildEquipmentSetUse(positionsOf(inventory, set.items)),
  );
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      store.abandonUse();
      throw error;
    }
    store.expireUse();
  }
  return lastUse(env);
}

function deleteSet(
  env: Env,
  index: number,
): Promise<{ index: number; setGuid: bigint }> {
  const { ctx, store } = env;
  if (!ctx.selfGuid()) throw new Error("the character is not in world");
  const snap = store.snapshot().sets;
  const set = snap.sets.find((entry) => entry.index === index);
  if (!set)
    return Promise.reject(new Error(`no set is stored at index ${index}`));
  const removed = store.beginDelete({
    index,
    setGuid: set.setGuid,
    requestedAt: ctx.now(),
  });
  if (!removed)
    return Promise.reject(new Error(`no set is stored at index ${index}`));
  ctx.send(
    GameOpcode.CMSG_DELETEEQUIPMENT_SET,
    buildEquipmentSetDelete(removed.setGuid),
  );
  return Promise.resolve({ index: removed.index, setGuid: removed.setGuid });
}

export function setActs(env: Env): SetActs {
  return {
    saveSet: (init) => saveSet(env, init),
    useSet: (index) => useSet(env, index),
    deleteSet: (index) => deleteSet(env, index),
  };
}
