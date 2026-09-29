import type { RewardsEvent } from "@peon/core";
import type { Occupied } from "#harness/areas/items/tool-resolve";
import {
  isObjectRef,
  type ObjectRow,
  reachYd,
  resolveObjectRef,
} from "#harness/areas/objects/reads";
import type { UseAfter, UseCtx } from "#harness/areas/objects/tool";
import type { LootLine } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { EventWaiter } from "#harness/loops/event-waiter";
import { lootObject } from "#harness/loops/loot-run";
import { itemIdText, nameLootLines } from "#harness/ops/item-names";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const OPEN_SETTLE_MS = 5000;

const REACH_MARGIN_YD = 6;

const USABLE: Record<number, true> = {
  0: true,
  1: true,
  2: true,
  3: true,
  8: true,
  9: true,
  10: true,
  22: true,
};

export function findObject(ctx: UseCtx, object: string): ObjectRow {
  const row = resolveObjectRef(ctx, object);
  if (!row || (isObjectRef(object) && row.ref !== object.trim()))
    throw new Refusal({
      detail: `no object named ${object} is nearby; look for it first.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_found",
    });
  return row;
}

export function checkReach(row: ObjectRow): void {
  refuseWhenFar(row, reachYd(row));
}

export function checkCastReach(row: ObjectRow): void {
  refuseWhenFar(row, reachYd(row) + REACH_MARGIN_YD);
}

function refuseWhenFar(row: ObjectRow, limit: number): void {
  if (row.distance === undefined || row.distance <= limit) return;
  throw new Refusal({
    detail: `${row.name} (${row.ref}) is ${row.distance} yd away; walk to it first.`,
    next: nextCall("travel", { to: row.ref }),
    reason: "too_far",
  });
}

export function checkUsable(row: ObjectRow): void {
  if (!USABLE[row.type])
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
}

export function undiscoveredLock(
  _handle: UseCtx["handle"],
  entry: number,
): Refusal {
  return new Refusal({
    detail: `the lock of object ${entry} is not known yet; look at it again later.`,
    next: nextCall("look", { find: "object" }),
    reason: "no_lock_data",
  });
}

export function lockedRefusal(skill: number, need: number): Refusal {
  return new Refusal({
    detail:
      skill === 0
        ? "the chest is locked and no known spell or key opens it."
        : `the lock needs skill ${skill} at ${need}.`,
    next: nextCall("look", { find: "object" }),
    reason: "locked",
  });
}

export function lootLineText(
  taken: readonly LootLine[],
  copper: number,
): string {
  const parts = taken.map((line) => `${line.count} x ${line.name}`);
  if (copper > 0) parts.push(`${copper} copper`);
  return parts.join(", ");
}

export function openObjectFlow(
  ctx: UseCtx,
  row: ObjectRow,
  key: string | undefined,
): Promise<ToolResult<UseAfter>> {
  const { handle } = ctx;
  const template = handle.objects.state().templates.get(row.entry);
  const type = template?.type ?? row.type;
  if (template?.pageId !== undefined && type === 9)
    throw new Refusal({
      detail: `${row.name} (${row.ref}) is read, not opened; use do read.`,
      next: nextCall("use", { do: "read", object: row.ref }),
      reason: "not_usable",
    });
  const lockId = template?.lockId;
  if (lockId === undefined) throw undiscoveredLock(handle, row.entry);
  if (template && key !== undefined)
    return openWithKey(ctx, row, key, template.questItems);
  if (lockId !== 0) return openLocked(ctx, row);
  return openUnlocked(ctx, row);
}

async function openUnlocked(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<ToolResult<UseAfter>> {
  const choice = await ctx.handle.objects.act.openLockSpell(row.entry);
  if ("by" in choice) {
    if (choice.by === "item") return openLocked(ctx, row);
    return openCast(ctx, row, choice.spellId);
  }
  if (choice.reason === "no_lock_data")
    throw undiscoveredLock(ctx.handle, row.entry);
  throw new Refusal({
    detail:
      `the server opens ${row.name} (${row.ref}) only through an opening spell, ` +
      "and none is known to this character; learn one first.",
    next: nextCall("journal", { about: "spells" }),
    reason: "no_open_spell",
  });
}

async function openCast(
  ctx: UseCtx,
  row: ObjectRow,
  spellId: number,
): Promise<ToolResult<UseAfter>> {
  const { handle, rt } = ctx;
  if (handle.getRewardsState().loot.phase === "open") await releaseStale(ctx);
  return withLootWatch(ctx, row, async () => {
    const useOutcome = await rt.mutex.run(() =>
      handle.objects.act.use(row.guid),
    );
    if (!("ok" in useOutcome))
      throw new Refusal({
        detail: `${row.name} (${row.ref}) cannot be used.`,
        next: nextCall("look", { find: "object" }),
        reason: "not_usable",
      });
    await castOpen(ctx, row, spellId);
  });
}

async function castOpen(
  ctx: UseCtx,
  row: ObjectRow,
  spellId: number,
): Promise<void> {
  const opened = await ctx.rt.mutex.run(() =>
    ctx.handle.objects.act.open(row.guid, spellId),
  );
  if (opened.ok) return;
  if (opened.reason === "loot_open")
    throw new Refusal({
      detail: "another loot window is open; close it first.",
      next: nextCall("loot", {}),
      reason: "loot_open",
    });
  throw new Refusal({
    detail: `${row.name} (${row.ref}) cannot be opened.`,
    next: nextCall("look", { find: "object" }),
    reason: "not_usable",
  });
}

async function withLootWatch(
  ctx: UseCtx,
  row: ObjectRow,
  send: () => Promise<void>,
): Promise<ToolResult<UseAfter>> {
  const waiter = new EventWaiter<RewardsEvent>();
  const off = ctx.handle.onRewardsEvent((event) => waiter.push(event));
  const watch = watchLoot(ctx);
  try {
    await send();
    return await lootWindow(ctx, row, `Opened ${row.name}`, { waiter, watch });
  } finally {
    watch.stop();
    off();
  }
}

async function openLocked(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<ToolResult<UseAfter>> {
  const { handle } = ctx;
  const choice = await handle.objects.act.openLockSpell(row.entry);
  if (!("by" in choice)) {
    if (choice.reason === "no_lock_data")
      throw undiscoveredLock(handle, row.entry);
    throw lockedRefusal(choice.skill, choice.need);
  }
  if (choice.by === "item")
    throw new Refusal({
      detail: `${row.name} (${row.ref}) needs its key item; name it with key.`,
      next: nextCall("use", { do: "open", key: "key", object: row.ref }),
      reason: "locked",
    });
  return openCast(ctx, row, choice.spellId);
}

async function openWithKey(
  ctx: UseCtx,
  row: ObjectRow,
  key: string,
  _questItems: readonly number[],
): Promise<ToolResult<UseAfter>> {
  const { handle, rt } = ctx;
  const inventory = handle.getInventoryState();
  const lowered = key.toLowerCase();
  const held = inventory.slots.find(
    (slot): slot is Occupied =>
      slot.status === "occupied" &&
      (slot.item.name?.toLowerCase() === lowered ||
        `item ${slot.item.entry}` === lowered),
  );
  if (held === undefined || held.status !== "occupied")
    throw new Refusal({
      detail: `no key named ${key} is in the bags.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "no_item",
    });
  if (handle.getRewardsState().loot.phase === "open") await releaseStale(ctx);
  return withLootWatch(ctx, row, async () => {
    const useOutcome = await rt.mutex.run(() =>
      handle.objects.act.use(row.guid),
    );
    if (!("ok" in useOutcome))
      throw new Refusal({
        detail: `${row.name} (${row.ref}) cannot be used.`,
        next: nextCall("look", { find: "object" }),
        reason: "not_usable",
      });
    const outcome = await rt.mutex.run(() =>
      handle.objects.act.useItemOn(held.item.entry as number, row.guid),
    );
    if (!outcome.ok) {
      const reasons: Record<string, string> = {
        loot_open: "another loot window is open; close it first.",
        no_item: `no key named ${key} is in the bags.`,
        no_use_spell: `${held.item.name ?? key} has no use spell.`,
        unknown: `${row.name} (${row.ref}) cannot be used.`,
      };
      throw new Refusal({
        detail: reasons[outcome.reason] ?? `${row.name} cannot be opened.`,
        next:
          outcome.reason === "no_item"
            ? nextCall("journal", { about: "bags" })
            : nextCall("look", { find: "object" }),
        reason: outcome.reason,
      });
    }
  });
}

async function releaseStale(ctx: UseCtx): Promise<void> {
  const { handle, rt } = ctx;
  await rt.mutex.run(() => handle.releaseLoot());
  const waiter = new EventWaiter<RewardsEvent>();
  const off = handle.onRewardsEvent((event) => waiter.push(event));
  try {
    await waiter.find(
      (event) => event.type === "loot_release_observed",
      OPEN_SETTLE_MS,
      ctx.signal,
    );
  } finally {
    off();
  }
}

type Offered = { count: number; itemId: number; slot: number };

function labelOf(itemId: number, lines: readonly LootLine[]): string {
  return (
    lines.find((line) => line.itemId === itemId)?.name ?? itemIdText(itemId)
  );
}

function namedLines(
  offered: readonly Offered[],
  taken: readonly number[],
  lines: readonly LootLine[],
): LootLine[] {
  return taken.map((slot) => {
    const item = offered.find((line) => line.slot === slot);
    const pushed = lines.find((line) => line.itemId === item?.itemId);
    return {
      count: item?.count ?? pushed?.count ?? 1,
      itemId: item?.itemId ?? pushed?.itemId ?? 0,
      name: labelOf(item?.itemId ?? 0, lines),
      quality: pushed?.quality ?? null,
    };
  });
}

type Watch = {
  offered: Offered[];
  pushed: LootLine[];
  taken: number[];
  stop: () => void;
};

function recordRemoved(
  offered: readonly Offered[],
  remaining: readonly { slot: number }[],
  taken: number[],
): void {
  for (const item of offered)
    if (
      !(
        taken.includes(item.slot) ||
        remaining.some((line) => line.slot === item.slot)
      )
    )
      taken.push(item.slot);
}

function watchLoot(ctx: UseCtx): Watch {
  const { handle } = ctx;
  const offered: Offered[] = [];
  const pushed: LootLine[] = [];
  const taken: number[] = [];
  const taps = handle.onRewardsEvent((event) => {
    const state = event.state;
    if (event.type === "loot_opened" && state.loot.phase === "open")
      for (const item of state.loot.items)
        offered.push({
          count: item.count,
          itemId: item.itemId,
          slot: item.slot,
        });
    if (event.type === "loot_removed" && state.loot.phase === "open")
      recordRemoved(offered, state.loot.items, taken);
    const push = state.lastItemPush;
    if (event.type === "item_push" && push)
      pushed.push({
        count: push.count,
        itemId: push.itemId,
        name: itemIdText(push.itemId),
        quality: null,
      });
  });
  return { offered, pushed, stop: taps, taken };
}

function objectLootRun(ctx: UseCtx, waiter: EventWaiter<RewardsEvent>) {
  const { handle } = ctx;
  return {
    bags: {
      questItems: () =>
        new Set(handle.getQuestState().items.map((item) => item.itemId)),
      stackSize: (entry: number) =>
        handle.getItemTemplate(entry).then(
          (template) => template?.stackSize,
          () => undefined,
        ),
    },
    events: waiter,
    rewards: {
      abandonOpen: () => handle.abandonLoot(),
      close: () => handle.releaseLoot(),
      open: () => {
        throw new Error("lootObject never opens");
      },
      snapshot: () => handle.getRewardsState(),
      take: (slot: number) => handle.takeLoot(slot),
      takeMoney: () => handle.takeLootMoney(),
    },
    signal: ctx.signal,
  };
}

async function partlyResult(
  ctx: UseCtx,
  row: ObjectRow,
  verb: string,
  watch: Watch,
): Promise<ToolResult<UseAfter>> {
  const { handle } = ctx;
  if (handle.getRewardsState().loot.phase === "open") handle.releaseLoot();
  const lines = await nameLootLines(ctx, watch.pushed);
  const taken = namedLines(watch.offered, watch.taken, lines);
  const left = Math.max(watch.offered.length - taken.length, 0);
  const { detail } = openedDetail(verb, taken, 0, left);
  return result("PARTLY", {
    after: {
      do: "open",
      object: row.ref,
      opened: true,
      taken: taken.map((line) => `${line.count} x ${line.name}`),
      text: undefined,
    },
    detail,
    next: nextCall("journal", { about: "bags" }),
    reason: "bags_full",
  });
}

function settleRefusal(row: ObjectRow, cause: string): Refusal {
  if (cause === "loot_denied:timeout")
    return new Refusal({
      detail: `${row.name} (${row.ref}) did not answer; the window may still open later.`,
      reason: "unanswered",
      status: "UNCONFIRMED",
    });
  return new Refusal({
    detail: `${row.name} (${row.ref}) failed to open: ${cause}.`,
    reason: "open_failed",
    status: "FAILED",
  });
}

function openedDetail(
  verb: string,
  taken: readonly LootLine[],
  money: number,
  left: number,
): { detail: string; status: "DONE" | "PARTLY" } {
  if (left > 0)
    return {
      detail: `${verb}: ${lootLineText(taken, money) || "nothing"}; ${left} item(s) left behind.`,
      status: "PARTLY",
    };
  return {
    detail: `${verb}${taken.length + money > 0 ? `: ${lootLineText(taken, money)}` : " (empty)"}.`,
    status: "DONE",
  };
}

async function openedResult(
  ctx: UseCtx,
  row: ObjectRow,
  verb: string,
  loot: {
    watch: Watch;
    record:
      | { slotsTaken: number[]; slotsLeft: number[]; moneyTaken: number }
      | undefined;
  },
): Promise<ToolResult<UseAfter>> {
  const { watch, record } = loot;
  const lines = await nameLootLines(ctx, watch.pushed);
  const named = namedLines(watch.offered, record?.slotsTaken ?? [], lines);
  const left = record?.slotsLeft ?? [];
  const taken = named.filter((line) =>
    (record?.slotsTaken ?? []).some(
      (slot) =>
        watch.offered.find((item) => item.slot === slot)?.itemId ===
        line.itemId,
    ),
  );
  const { detail, status } = openedDetail(
    verb,
    taken,
    record?.moneyTaken ?? 0,
    left.length,
  );
  return result(status, {
    after: {
      do: "open",
      object: row.ref,
      opened: true,
      taken: taken.map((line) => `${line.count} x ${line.name}`),
      text: undefined,
    },
    detail,
    ...(left.length > 0
      ? { next: nextCall("journal", { about: "bags" }), reason: "bags_full" }
      : {}),
  });
}

async function lootWindow(
  ctx: UseCtx,
  row: ObjectRow,
  verb: string,
  observed?: { waiter: EventWaiter<RewardsEvent>; watch: Watch },
): Promise<ToolResult<UseAfter>> {
  const { handle, rt } = ctx;
  const owned = observed?.waiter ?? new EventWaiter<RewardsEvent>();
  const off = observed
    ? () => undefined
    : handle.onRewardsEvent((event) => owned.push(event));
  const watch = observed?.watch ?? watchLoot(ctx);
  try {
    const outcome = await rt.mutex.run(() =>
      lootObject(objectLootRun(ctx, owned), row.guid),
    );
    if (!outcome.ok) {
      if (
        outcome.cause === "inventory_reserve_reached" ||
        outcome.cause === "loot_inventory_full"
      )
        return partlyResult(ctx, row, verb, watch);
      handle.abandonLoot();
      throw settleRefusal(row, outcome.cause);
    }
    return openedResult(ctx, row, verb, { record: outcome.record, watch });
  } finally {
    watch.stop();
    off();
  }
}
