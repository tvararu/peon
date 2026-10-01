import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { loadDisplayCatalog } from "#wow/areas/objects/display-catalog";
import {
  type LockCatalog,
  type LockEntry,
  loadLockCatalog,
} from "#wow/areas/objects/lock-catalog";
import { pickOpenLock } from "#wow/areas/objects/open-lock";
import type {
  ObjectsEvent,
  ObjectsStore,
  PageChain,
  UnansweredPage,
  UseRecord,
  UseRefusal,
} from "#wow/areas/objects/store";
import type { Entity, EntityLookup } from "#wow/entity-store";
import { readInventory } from "#wow/inventory";
import { buildGameObjectQuery } from "#wow/protocol/entity-queries";
import { buildUseItem, ItemSpellTrigger } from "#wow/protocol/item";
import { GameOpcode } from "#wow/protocol/opcodes";
import { buildCastSpell, parseCastFailed } from "#wow/protocol/spell";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores } from "#wow/session-stores";
export type OpenOutcome =
  | { ok: true }
  | { ok: false; reason: "unknown" }
  | {
      ok: false;
      reason: "loot_open" | "locked" | "no_lock_data";
      skill?: number;
      need?: number;
    };
export type UseItemOnOutcome =
  | OpenOutcome
  | { ok: false; reason: "no_item" | "no_use_spell" };
export type UseOutcome = { ok: true; record: UseRecord } | UseRefusal;
export type ObjectsActs = {
  enterTrigger: (triggerId: number) => void;
  triggersNear: (
    map: number,
    x: number,
    y: number,
    radius: number,
  ) => readonly NearTrigger[];
  use: (guid: bigint) => UseOutcome;
  open: (guid: bigint, spellId: number) => OpenOutcome;
  useItemOn: (entry: number, target: bigint) => Promise<UseItemOnOutcome>;
  openLockSpell: (entry: number) => Promise<OpenLockQuery>;
  readPage: (pageId: number) => Promise<PageChain | UnansweredPage>;
};
export type NearTrigger = { id: number; x: number; y: number; z: number };
export type OpenLockQuery =
  | { by: "spell"; spellId: number }
  | { by: "item"; entry: number }
  | {
      ok: false;
      reason: "locked" | "no_lock_data";
      skill: number;
      need: number;
    };

const SKILL_SLOTS = 128;

function skillOf(
  getEntity: EntityLookup,
  selfGuid: bigint,
  skill: number,
): number {
  const self = getEntity(selfGuid);
  const raw = self?.rawFields;
  if (!raw) return 0;
  const base = PLAYER_FIELDS.SKILL_INFO.offset;
  for (let i = 0; i < SKILL_SLOTS; i++) {
    const id = (raw.get(base + i * 3) ?? 0) & 0xff_ff;
    if (id !== skill) continue;
    const value = raw.get(base + i * 3 + 1) ?? 0;
    const bonus = raw.get(base + i * 3 + 2) ?? 0;
    const signed = (n: number) => (n >= 0x80_00 ? n - 0x1_00_00 : n);
    return Math.max(
      0,
      (value & 0xff_ff) +
        signed(bonus & 0xff_ff) +
        signed((bonus >> 16) & 0xff_ff),
    );
  }
  return 0;
}

function openSpell(core: CoreStores): { id: number } | undefined {
  return core.combat
    .spellbook()
    .find((spell) => spell.effects.some((effect) => effect.effect === 33));
}

function unlockable(
  catalog: LockCatalog | undefined,
  lockId: number,
): LockEntry | OpenLockQuery {
  if (lockId === 0) return { id: 0, cases: [] };
  const lock = catalog?.get(lockId);
  if (!lock) return { ok: false, reason: "no_lock_data", skill: 0, need: 0 };
  return lock;
}

type Env = {
  ctx: AreaRuntimeCtx<ObjectsEvent>;
  store: ObjectsStore;
  core: CoreStores;
};

function choiceFor(env: Env, lock: LockEntry): OpenLockQuery {
  const { ctx, store, core } = env;
  const selfGuid = ctx.selfGuid() ?? 0n;
  const carried = readInventory(selfGuid, (guid) => store.entity(guid));
  const entries = new Set<number>();
  for (const slot of carried.slots) {
    if (slot.status === "occupied" && slot.item.entry !== undefined)
      entries.add(slot.item.entry);
  }
  const choice = pickOpenLock({
    hasItem: (item) => entries.has(item),
    lock,
    skillOf: (skill) =>
      skillOf(
        (guid) => store.entity(guid) as Entity | undefined,
        selfGuid,
        skill,
      ),
    spellbook: core.combat.spellbook(),
  });
  if ("by" in choice) return choice;
  return {
    ok: false,
    reason: "locked",
    skill: choice.skill,
    need: choice.need,
  };
}

export function openObject(
  env: Env,
  guid: bigint,
  spellId: number,
): OpenOutcome {
  const { ctx, store, core } = env;
  if (core.rewards.loot.phase !== "closed")
    return { ok: false, reason: "loot_open" };
  const object = store.object(guid);
  if (!object) return { ok: false, reason: "unknown" };
  core.rewards.requestOpen(guid);
  ctx.send(
    GameOpcode.CMSG_CAST_SPELL,
    buildCastSpell(0, spellId, { guid, kind: "object" }),
  );
  store.recordOpen(object, spellId);
  releaseUnanswered(env, guid, spellId);
  return { ok: true as const };
}

function carriedKey(
  env: Env,
  entry: number,
): { bag: number; slot: number; guid: bigint } | undefined {
  const { ctx, store } = env;
  const selfGuid = ctx.selfGuid() ?? 0n;
  const inventory = readInventory(selfGuid, (guid) => store.entity(guid));
  for (const slot of inventory.slots) {
    if (slot.status === "occupied" && slot.item.entry === entry)
      return { bag: slot.bag, slot: slot.slot, guid: slot.guid };
  }
  return undefined;
}

async function useSpellOf(
  core: CoreStores,
  entry: number,
): Promise<number | undefined> {
  const template = await core.items.lookup(entry).catch(() => undefined);
  return template?.spells.find(
    (spell) => spell.trigger === ItemSpellTrigger.ON_USE,
  )?.id;
}

export async function useItemOnObject(
  env: Env,
  entry: number,
  guid: bigint,
): Promise<UseItemOnOutcome> {
  const { ctx, store, core } = env;
  if (!store.object(guid)) return { ok: false, reason: "unknown" };
  if (!carriedKey(env, entry)) return { ok: false, reason: "no_item" };
  const spellId = await useSpellOf(core, entry);
  if (spellId === undefined) return { ok: false, reason: "no_use_spell" };
  if (core.rewards.loot.phase !== "closed")
    return { ok: false, reason: "loot_open" };
  const object = store.object(guid);
  const key = carriedKey(env, entry);
  if (!object) return { ok: false, reason: "unknown" };
  if (!key) return { ok: false, reason: "no_item" };
  core.rewards.requestOpen(guid);
  ctx.send(
    GameOpcode.CMSG_USE_ITEM,
    buildUseItem({
      bag: key.bag,
      castCount: 0,
      itemGuid: key.guid,
      slot: key.slot,
      spellId,
      target: { guid, kind: "object" },
    }),
  );
  store.recordOpen(object, spellId);
  releaseUnanswered(env, guid, spellId);
  return { ok: true };
}

const OPEN_WAIT_MS = 15_000;

function releaseUnanswered(env: Env, guid: bigint, spellId: number): void {
  const { ctx, core } = env;
  ctx
    .expect(GameOpcode.SMSG_CAST_FAILED, {
      timeoutMs: OPEN_WAIT_MS,
      match: (reader) => parseCastFailed(reader).spellId === spellId,
    })
    .then(
      () => "cast_failed",
      () => "timeout",
    )
    .then((reason) => {
      const loot = core.rewards.loot;
      if (loot.phase === "opening" && loot.guid === guid)
        core.rewards.failOpen(reason);
    })
    .catch(ignoreFailure);
}

const TEMPLATE_WAIT_MS = 5000;
const ENTRY_MASK = 0x7f_ff_ff_ff;

async function waitTemplate(
  env: Env,
  entry: number,
): Promise<number | undefined> {
  const { ctx, store } = env;
  const known = store.lockOf(entry);
  if (known !== undefined) return known;
  ctx.send(GameOpcode.CMSG_GAMEOBJECT_QUERY, buildGameObjectQuery(entry, 0n));
  const settled = ctx.expect(GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE, {
    timeoutMs: TEMPLATE_WAIT_MS,
    match: (reader) => (reader.uint32LE() & ENTRY_MASK) === entry,
  });
  try {
    await settled;
  } catch {
    return undefined;
  }
  return store.lockOf(entry);
}

export function queryOpenLock(env: Env, entry: number): Promise<OpenLockQuery> {
  const { store, core } = env;
  return store.waitLocks().then(async (catalog) => {
    const lockId = await waitTemplate(env, entry);
    if (lockId === undefined)
      return { ok: false, reason: "no_lock_data", skill: 0, need: 0 };
    if (lockId === 0) {
      const any = openSpell(core);
      if (any) return { by: "spell", spellId: any.id };
      return { ok: false, reason: "locked", skill: 0, need: 0 };
    }
    const lock = unlockable(catalog, lockId);
    if (!("cases" in lock)) return lock;
    return choiceFor(env, lock);
  });
}

export function loadDisplays(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
): void {
  const { dbc, signal } = ctx;
  if (!dbc) return;
  loadDisplayCatalog(dbc).then(
    (catalog) => {
      if (!signal.aborted) store.useDisplays(catalog);
    },
    () => undefined,
  );
}

export function loadLocks(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
): void {
  const { dbc, signal } = ctx;
  if (!dbc) return;
  store.loadingLocks();
  loadLockCatalog(dbc)
    .then(
      (catalog) => {
        if (!signal.aborted) store.useLocks(catalog);
      },
      () => store.locksFailed(),
    )
    .catch(ignoreFailure);
}
