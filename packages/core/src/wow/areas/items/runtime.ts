import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { ItemsEvent } from "#wow/areas/items/events";
import {
  BACKPACK,
  findItem,
  type HeldSlot,
  isWorn,
  LAST_BAG_SLOT,
  type MoveKind,
  type MoveRequest,
  type MoveState,
  NULL_BAG,
  NULL_SLOT,
  positionRefusal,
  slotAt,
} from "#wow/areas/items/moves";
import {
  buildAutoEquipItem,
  buildAutoEquipItemSlot,
  buildAutostoreBagItem,
  buildSetAmmo,
  buildSplitItem,
  buildSwapInvItem,
  buildSwapItem,
  type ItemPosition,
} from "#wow/areas/items/protocol";
import { buildWrapItem } from "#wow/areas/items/protocol-names";
import { type NameActs, nameActs } from "#wow/areas/items/runtime-names";
import { type ReadActs, readActs } from "#wow/areas/items/runtime-reads";
import { type RefundActs, refundActs } from "#wow/areas/items/runtime-refunds";
import { type SetActs, setActs } from "#wow/areas/items/runtime-sets";
import { type SocketActs, socketActs } from "#wow/areas/items/runtime-sockets";
import { wornItemLevel } from "#wow/areas/items/slots";
import type { ItemsStore } from "#wow/areas/items/store";
import type { InventoryState } from "#wow/inventory";
import type { ItemPushResult } from "#wow/protocol/loot";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const MOVE_ANSWER_MS = 5000;
const WRAPPER_FLAG = 0x2_00;

export type ItemsActs = {
  equip: (from: ItemPosition) => Promise<MoveState>;
  equipTo: (itemGuid: bigint, slot: number) => Promise<MoveState>;
  unequip: (slot: number, toBag?: number) => Promise<MoveState>;
  move: (from: ItemPosition, to: ItemPosition) => Promise<MoveState>;
  split: (
    from: ItemPosition,
    to: ItemPosition,
    count: number,
  ) => Promise<MoveState>;
  setAmmo: (entry: number) => Promise<MoveState>;
  wrap: (gift: ItemPosition, item: ItemPosition) => Promise<MoveState>;
} & ReadActs &
  SocketActs &
  SetActs &
  RefundActs &
  NameActs;

const SETTLED = new Set<ItemsEvent["type"]>([
  "moved",
  "move_refused",
  "move_no_change",
  "move_unanswered",
]);
const hex = (guid: bigint) => `0x${guid.toString(16)}`;
const stack = (held: HeldSlot) => held.item.count ?? 1;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function checkWornSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot > LAST_BAG_SLOT)
    throw new Error(`slot ${slot} is not an equipment or bag slot`);
}

function checkNamedStoreBag(bag: number): void {
  const bagSlot = bag >= LAST_BAG_SLOT - 3 && bag <= LAST_BAG_SLOT;
  if (bag !== NULL_BAG && bag !== BACKPACK && !bagSlot)
    throw new Error(`bag ${bag} is not autostore or a bag slot`);
}

function heldAt(inventory: InventoryState, position: ItemPosition): HeldSlot {
  const refusal = positionRefusal(position);
  if (refusal) throw new Error(refusal);
  const held = slotAt(inventory, position);
  if (!held)
    throw new Error(`bag ${position.bag} slot ${position.slot} is empty`);
  return held;
}

function samePlace(a: ItemPosition, b: ItemPosition): boolean {
  return a.bag === b.bag && a.slot === b.slot;
}

type Env = {
  ctx: AreaRuntimeCtx<ItemsEvent>;
  store: ItemsStore;
  core: CoreStores;
};

function ready({ ctx, store }: Env, kind: MoveKind): InventoryState {
  const inventory = store.inventory();
  if (!ctx.selfGuid() || inventory.status === "unknown")
    throw new Error("the character is not in world");
  const life = store.life();
  if (kind !== "unequip" && life !== "alive")
    throw new Error(`the character is ${life}`);
  if (store.snapshot().move.pending)
    throw new Error("a move is already pending");
  if (store.snapshot().sets.usePending) throw new Error("a set use is pending");
  return inventory;
}

async function equippable(
  { core }: Env,
  entry: number | undefined,
): Promise<void> {
  const template =
    entry === undefined
      ? undefined
      : await core.items.lookup(entry).catch(() => undefined);
  if (!template) throw new Error(`no item template for entry ${entry}`);
  if (template.inventoryType === 0)
    throw new Error(`item ${entry} is not equippable`);
}

type Shape = {
  held: HeldSlot;
  to?: ItemPosition | undefined;
  count?: number;
  stackBefore?: number;
  target?: HeldSlot | undefined;
};

function request(env: Env, kind: MoveKind, shape: Shape): MoveRequest {
  const {
    held,
    to,
    count = stack(held),
    stackBefore = stack(held),
    target,
  } = shape;
  return {
    kind,
    itemGuid: held.guid,
    entry: held.item.entry,
    from: { bag: held.bag, slot: held.slot },
    to,
    count,
    stackBefore,
    target: target && { guid: target.guid, count: stack(target) },
    requestedAt: env.ctx.now(),
  };
}

async function run(
  { ctx, store }: Env,
  pending: MoveRequest,
  packet: readonly [opcode: number, body: Uint8Array],
): Promise<MoveState> {
  store.begin(pending);
  const settled = ctx.until((event) => SETTLED.has(event.type), {
    timeoutMs: MOVE_ANSWER_MS,
  });
  ctx.send(...packet);
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      store.abandon();
      throw error;
    }
    store.expire();
  }
  return store.snapshot().move;
}

async function equip(env: Env, from: ItemPosition): Promise<MoveState> {
  const held = heldAt(ready(env, "equip"), from);
  if (isWorn(held)) throw new Error(`${hex(held.guid)} is already worn`);
  await equippable(env, held.item.entry);
  ready(env, "equip");
  return run(env, request(env, "equip", { held, to: undefined }), [
    GameOpcode.CMSG_AUTOEQUIP_ITEM,
    buildAutoEquipItem(from),
  ]);
}

async function equipTo(
  env: Env,
  itemGuid: bigint,
  slot: number,
): Promise<MoveState> {
  checkWornSlot(slot);
  const held = findItem(ready(env, "equip_slot"), itemGuid);
  if (!held) throw new Error(`item ${hex(itemGuid)} is not carried`);
  const to = { bag: BACKPACK, slot };
  if (samePlace(held, to))
    throw new Error(`${hex(itemGuid)} is already in slot ${slot}`);
  await equippable(env, held.item.entry);
  ready(env, "equip_slot");
  return run(env, request(env, "equip_slot", { held, to }), [
    GameOpcode.CMSG_AUTOEQUIP_ITEM_SLOT,
    buildAutoEquipItemSlot(itemGuid, slot),
  ]);
}

async function unequip(
  env: Env,
  slot: number,
  toBag = NULL_BAG,
): Promise<MoveState> {
  checkWornSlot(slot);
  checkNamedStoreBag(toBag);
  const from = { bag: BACKPACK, slot };
  const held = heldAt(ready(env, "unequip"), from);
  if (!isWorn(held))
    throw new Error(
      `bag ${from.bag} slot ${from.slot} holds no worn gear to take off`,
    );
  const to = { bag: toBag, slot: NULL_SLOT };
  return await run(env, request(env, "unequip", { held, to }), [
    GameOpcode.CMSG_AUTOSTORE_BAG_ITEM,
    buildAutostoreBagItem(from, toBag),
  ]);
}

function destination(
  env: Env,
  kind: MoveKind,
  from: ItemPosition,
  to: ItemPosition,
) {
  const inventory = ready(env, kind);
  const refusal = positionRefusal(to);
  if (refusal) throw new Error(refusal);
  if (samePlace(from, to)) throw new Error(`the ${kind} has no destination`);
  return { held: heldAt(inventory, from), target: slotAt(inventory, to) };
}

async function move(
  env: Env,
  from: ItemPosition,
  to: ItemPosition,
): Promise<MoveState> {
  const inventory = ready(env, "swap");
  const refusal = positionRefusal(to);
  if (refusal) throw new Error(refusal);
  if (samePlace(from, to)) throw new Error("the swap has no destination");
  const held = heldAt(inventory, from);
  const toBag = to.bag === BACKPACK ? NULL_BAG : to.bag;
  if (isWorn(held)) return unequip(env, held.slot, toBag);
  const inside = from.bag === BACKPACK && to.bag === BACKPACK;
  return await run(
    env,
    request(env, "swap", { held, target: slotAt(inventory, to), to }),
    inside
      ? [GameOpcode.CMSG_SWAP_INV_ITEM, buildSwapInvItem(to.slot, from.slot)]
      : [GameOpcode.CMSG_SWAP_ITEM, buildSwapItem(to, from)],
  );
}

async function split(
  env: Env,
  from: ItemPosition,
  to: ItemPosition,
  count: number,
): Promise<MoveState> {
  const { held, target } = destination(env, "split", from, to);
  if (!Number.isInteger(count) || count < 1 || count >= stack(held))
    throw new Error(`split count must be 1 to ${stack(held) - 1}`);
  return await run(env, request(env, "split", { count, held, target, to }), [
    GameOpcode.CMSG_SPLIT_ITEM,
    buildSplitItem(from, to, count),
  ]);
}

async function setAmmo(env: Env, entry: number): Promise<MoveState> {
  const inventory = ready(env, "ammo");
  if (!Number.isInteger(entry) || entry < 0)
    throw new Error(`ammo entry ${entry} is not a non-negative integer`);
  if (inventory.ammoId === entry)
    throw new Error(`ammo ${entry} is already loaded`);
  const stacks = inventory.slots.filter(
    (slot) => slot.status === "occupied" && slot.item.entry === entry,
  );
  if (entry !== 0 && stacks.length === 0)
    throw new Error(`ammo ${entry} is not carried`);
  const held =
    stacks.find((slot) => slot.bag === BACKPACK && slot.slot > LAST_BAG_SLOT) ??
    stacks[0];
  const shape: Shape =
    entry === 0
      ? {
          count: 0,
          held: {
            bag: BACKPACK,
            guid: 0n,
            item: { count: 0, entry: 0 },
            slot: NULL_SLOT,
            status: "occupied",
          } as HeldSlot,
          stackBefore: 0,
        }
      : { held: held as HeldSlot };
  return await run(env, request(env, "ammo", shape), [
    GameOpcode.CMSG_SET_AMMO,
    buildSetAmmo(entry),
  ]);
}

async function wrapper(
  { core }: Env,
  entry: number | undefined,
): Promise<void> {
  const template =
    entry === undefined
      ? undefined
      : await core.items.lookup(entry).catch(() => undefined);
  if (!template) throw new Error(`no item template for entry ${entry}`);
  if ((template.flags & WRAPPER_FLAG) === 0)
    throw new Error(`item ${entry} is not a wrapper`);
}

async function wrap(
  env: Env,
  gift: ItemPosition,
  item: ItemPosition,
): Promise<MoveState> {
  const inventory = ready(env, "wrap");
  const paper = heldAt(inventory, gift);
  const target = heldAt(inventory, item);
  if (samePlace(gift, item)) throw new Error("a gift cannot wrap itself");
  if (isWorn(target))
    throw new Error(`${hex(target.guid)} is worn and cannot be wrapped`);
  await wrapper(env, paper.item.entry);
  ready(env, "wrap");
  const pending: MoveRequest = {
    ...request(env, "wrap", { held: target }),
    target: { guid: paper.guid, count: 1 },
  };
  return await run(env, pending, [
    GameOpcode.CMSG_WRAP_ITEM,
    buildWrapItem(gift, item),
  ]);
}

async function received(
  { store, core }: Env,
  push: ItemPushResult,
): Promise<void> {
  const template = await core.items.lookup(push.itemId);
  if (!template) return;
  const inventory = store.inventory();
  const there = slotAt(inventory, { bag: push.bagSlot, slot: push.slot });
  store.receiveItem({
    entry: push.itemId,
    guid: there?.item.entry === push.itemId ? there.guid : undefined,
    itemLevel: template.itemLevel,
    inventoryType: template.inventoryType,
    wornItemLevel: await wornItemLevel(
      inventory,
      template.inventoryType,
      (entry) => core.items.lookup(entry),
    ),
  });
}

export function itemsRuntime(
  ctx: AreaRuntimeCtx<ItemsEvent>,
  store: ItemsStore,
  core: CoreStores,
): AreaRuntime<ItemsActs> {
  const env = { ctx, store, core };
  const note = () => store.noteClaims();
  const offs = [
    ctx.listen("entity", () => store.observeInventory()),
    core.destroy.onEvent(note),
    core.vendor.onEvent(note),
    core.quests.onEvent(note),
    core.rewards.onEvent((event) => {
      note();
      const push = event.state.lastItemPush;
      if (event.type === "item_push" && push)
        received(env, push).catch(ignoreFailure);
    }),
  ];
  return {
    act: {
      equip: (from) => equip(env, from),
      equipTo: (itemGuid, slot) => equipTo(env, itemGuid, slot),
      unequip: (slot, toBag) => unequip(env, slot, toBag),
      move: (from, to) => move(env, from, to),
      setAmmo: (entry) => setAmmo(env, entry),
      wrap: (gift, item) => wrap(env, gift, item),
      split: (from, to, count) => split(env, from, to, count),
      ...readActs(env),
      ...socketActs(env),
      ...setActs(env),
      ...refundActs(env),
      ...nameActs(env),
    },
    dispose: () => {
      for (const off of offs) off();
    },
  };
}
