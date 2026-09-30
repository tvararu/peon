import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPetAction,
  buildPetCancelAura,
  buildPetCastSpell,
  buildPetNameQuery,
  buildPetRename,
  buildPetSetAction,
  buildPetSpellAutocast,
  buildPetStopAttack,
  buildRequestPetInfo,
  PET_ACTION,
  type PetSetActionPair,
} from "#wow/areas/pets/protocol";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SpellTarget } from "#wow/protocol/spell-targets";
import type { CoreStores } from "#wow/session-stores";
export type PetOrder = "stay" | "follow" | "dismiss";
export type PetStance = "passive" | "defensive" | "aggressive";
export type PetsRefused = {
  ok: false;
  reason:
    | "no_pet"
    | "hunter_pet_dismiss"
    | "not_known"
    | "dead"
    | "not_autocastable"
    | "bad_slot"
    | "passive"
    | "not_removable"
    | "not_renamable";
};
export type PetsCast =
  | { ok: true; castCount: number; confirmed: boolean }
  | PetsRefused;
export type PetsActResult = { ok: true } | PetsRefused;
export type PetsActs = {
  requestPetInfo: () => { ok: true };
  petCommand: (order: PetOrder) => PetsActResult;
  petStance: (stance: PetStance) => PetsActResult;
  petStopAttack: () => PetsActResult;
  petCast: (spell: number, target: SpellTarget) => PetsCast;
  petAutocast: (spell: number, on: boolean) => PetsActResult;
  petSetAction: (slot: number, action: number, type: number) => PetsActResult;
  petSwapActions: (a: number, b: number) => PetsActResult;
  petCancelAura: (spell: number) => PetsActResult;
  queryPetName: () => PetsActResult;
  renamePet: (name: string) => PetsActResult;
};

const ORDERS: Record<PetOrder, number> = { stay: 0, follow: 1, dismiss: 3 };
const STANCES: Record<PetStance, number> = {
  passive: 0,
  defensive: 1,
  aggressive: 2,
};
const NO_PET: PetsRefused = { ok: false, reason: "no_pet" };

type Ctx = AreaRuntimeCtx<PetsEvent>;
const SPELL_ATTR0_PASSIVE = 0x40;

function requestPetInfo(ctx: Ctx): { ok: true } {
  ctx.send(GameOpcode.CMSG_REQUEST_PET_INFO, buildRequestPetInfo());
  return { ok: true };
}

const RENAME_TIMEOUT_MS = 5000;

type NameQuery = { guid: bigint; number: number; timestamp: number };

function sendNameQuery(ctx: Ctx, store: PetsStore, query: NameQuery): void {
  if (query.number === 0) return;
  if (store.nameStale(query.number, query.timestamp))
    ctx.send(
      GameOpcode.CMSG_PET_NAME_QUERY,
      buildPetNameQuery(query.number, query.guid),
    );
}

type PendingRename = { abort: () => void };

function queryPetNameAct(ctx: Ctx, store: PetsStore): PetsActResult {
  const { bar, pet } = store.snapshot();
  if (!(bar && pet)) return NO_PET;
  ctx.send(
    GameOpcode.CMSG_PET_NAME_QUERY,
    buildPetNameQuery(pet.number, bar.guid),
  );
  return { ok: true };
}

function renamePetAct(
  ctx: Ctx,
  store: PetsStore,
  pending: PendingRename,
  name: string,
): PetsActResult {
  const { bar, pet } = store.snapshot();
  if (!(bar && pet)) return NO_PET;
  if (!pet.canRename) return { ok: false, reason: "not_renamable" };
  ctx.send(GameOpcode.CMSG_PET_RENAME, buildPetRename(bar.guid, name));
  const baseline = pet.nameTimestamp;
  const number = pet.number;
  pending.abort();
  const waiter = ctx.until(
    (event) =>
      (event.type === "name" &&
        event.name.number === number &&
        event.name.timestamp > baseline) ||
      event.type === "name_invalid",
    { signal: ctx.signal, timeoutMs: RENAME_TIMEOUT_MS },
  );
  const onAbort = () => {
    waiter.catch(() => undefined).then(() => undefined);
  };
  pending.abort = onAbort;
  void waiter.then(
    () => undefined,
    (error: unknown) => {
      if (ctx.signal.aborted) return;
      if (error instanceof Error && error.message === "timeout")
        store.unanswered();
    },
  );
  return { ok: true };
}

function nameActs(
  ctx: Ctx,
  store: PetsStore,
  pending: PendingRename,
): Pick<PetsActs, "queryPetName" | "renamePet"> {
  return {
    queryPetName: () => queryPetNameAct(ctx, store),
    renamePet: (name) => renamePetAct(ctx, store, pending, name),
  };
}

function observeNames(ctx: Ctx, store: PetsStore): () => void {
  const offStore = store.onEvent((event) => {
    if (event.type !== "bar" || event.cleared) return;
    const { pet } = store.snapshot();
    if (!pet) return;
    sendNameQuery(ctx, store, {
      guid: event.bar.guid,
      number: pet.number,
      timestamp: pet.nameTimestamp,
    });
  });
  const offEntity = ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    const entity: Entity = event.entity;
    const { bar, pet } = store.snapshot();
    if (!(bar && pet) || entity.guid !== bar.guid) return;
    sendNameQuery(ctx, store, {
      guid: bar.guid,
      number: pet.number,
      timestamp: pet.nameTimestamp,
    });
  });
  return () => {
    offStore();
    offEntity();
  };
}

function confirm(
  ctx: Ctx,
  pet: bigint,
  type: number,
  value: number,
): PetsActResult {
  ctx.send(GameOpcode.CMSG_PET_ACTION, buildPetAction(pet, type, value, 0n));
  return requestPetInfo(ctx);
}

function orderActs(
  ctx: Ctx,
  store: PetsStore,
): Pick<PetsActs, "petCommand" | "petStance" | "petStopAttack"> {
  return {
    petCommand: (order) => {
      const { bar, pet } = store.snapshot();
      if (!bar) return NO_PET;
      if (order !== "dismiss")
        return confirm(ctx, bar.guid, PET_ACTION.command, ORDERS[order]);
      if (!pet) return NO_PET;
      if (pet.canAbandon) return { ok: false, reason: "hunter_pet_dismiss" };
      ctx.send(
        GameOpcode.CMSG_PET_ACTION,
        buildPetAction(bar.guid, PET_ACTION.command, ORDERS.dismiss, 0n),
      );
      return { ok: true };
    },
    petStance: (stance) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      return confirm(ctx, bar.guid, PET_ACTION.reaction, STANCES[stance]);
    },
    petStopAttack: () => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      ctx.send(GameOpcode.CMSG_PET_STOP_ATTACK, buildPetStopAttack(bar.guid));
      return { ok: true };
    },
  };
}

function spellActs(
  ctx: Ctx,
  store: PetsStore,
  core: CoreStores,
): Pick<PetsActs, "petAutocast" | "petCancelAura" | "petCast"> {
  let castCount = 0;
  return {
    petAutocast: (spell, on) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      const row = bar.spells.find((entry) => entry.spell === spell);
      if (!row) return { ok: false, reason: "not_known" };
      if (row.autocast === "passive")
        return { ok: false, reason: "not_autocastable" };
      ctx.send(
        GameOpcode.CMSG_PET_SPELL_AUTOCAST,
        buildPetSpellAutocast(bar.guid, spell, on),
      );
      return requestPetInfo(ctx);
    },
    petCancelAura: (spell) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      ctx.send(
        GameOpcode.CMSG_PET_CANCEL_AURA,
        buildPetCancelAura(bar.guid, spell),
      );
      return { ok: true };
    },
    petCast: (spell, target) => {
      const { bar, pet } = store.snapshot();
      if (!bar) return NO_PET;
      const row = bar.spells.find((entry) => entry.spell === spell);
      if (!row) return { ok: false, reason: "not_known" };
      const raw = core.combat.definition(spell)?.attributes.raw;
      if (raw !== undefined && (raw & SPELL_ATTR0_PASSIVE) !== 0)
        return { ok: false, reason: "passive" };
      if (!pet) return NO_PET;
      if (pet.health === 0) return { ok: false, reason: "dead" };
      castCount = castCount === 255 ? 1 : castCount + 1;
      ctx.send(
        GameOpcode.CMSG_PET_CAST_SPELL,
        buildPetCastSpell(bar.guid, castCount, spell, target),
      );
      return { castCount, confirmed: raw !== undefined, ok: true };
    },
  };
}

function barActs(
  ctx: Ctx,
  store: PetsStore,
): Pick<PetsActs, "petSetAction" | "petSwapActions"> {
  return {
    petSetAction: (slot, action, type) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      if (!(slot >= 0 && slot < 10)) return { ok: false, reason: "bad_slot" };
      if (type === PET_ACTION.command || type === PET_ACTION.reaction)
        return { ok: false, reason: "not_removable" };
      const packed = ((type << 24) | (action & 0xff_ff_ff)) >>> 0;
      const pair: PetSetActionPair = { packed, slot };
      ctx.send(
        GameOpcode.CMSG_PET_SET_ACTION,
        buildPetSetAction(bar.guid, [pair]),
      );
      return { ok: true };
    },
    petSwapActions: (a, b) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      if (!(a >= 0 && a < 10 && b >= 0 && b < 10))
        return { ok: false, reason: "bad_slot" };
      const packedOf = (slot: number) => {
        const entry = bar.slots[slot];
        return (
          (((entry?.type ?? 0) << 24) | ((entry?.action ?? 0) & 0xff_ff_ff)) >>>
          0
        );
      };
      ctx.send(
        GameOpcode.CMSG_PET_SET_ACTION,
        buildPetSetAction(bar.guid, [
          { packed: packedOf(b), slot: a },
          { packed: packedOf(a), slot: b },
        ]),
      );
      return { ok: true };
    },
  };
}

export function petsRuntime(
  ctx: Ctx,
  store: PetsStore,
  core: CoreStores,
): AreaRuntime<PetsActs> {
  const orders = orderActs(ctx, store);
  const spells = spellActs(ctx, store, core);
  const bar = barActs(ctx, store);
  const offNames = observeNames(ctx, store);
  const pending = { abort: () => undefined };
  const names = nameActs(ctx, store, pending);
  return {
    act: {
      petAutocast: spells.petAutocast,
      petCancelAura: spells.petCancelAura,
      petCast: spells.petCast,
      petCommand: orders.petCommand,
      petSetAction: bar.petSetAction,
      petStance: orders.petStance,
      petStopAttack: orders.petStopAttack,
      petSwapActions: bar.petSwapActions,
      queryPetName: names.queryPetName,
      renamePet: names.renamePet,
      requestPetInfo: () => requestPetInfo(ctx),
    },
    dispose: () => {
      offNames();
      pending.abort();
    },
  };
}
