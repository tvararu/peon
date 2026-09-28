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
  if (row.distance === undefined || row.distance <= reachYd(row)) return;
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

function openUnlocked(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<ToolResult<UseAfter>> {
  const { handle } = ctx;
  const outcome = handle.objects.act.use(row.guid);
  if (!("ok" in outcome))
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
  return lootWindow(ctx, row, `Opened ${row.name}`);
}

async function openLocked(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<ToolResult<UseAfter>> {
  const { handle, rt } = ctx;
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
  if (handle.getRewardsState().loot.phase === "open") await releaseStale(ctx);
  const useOutcome = await rt.mutex.run(() => handle.objects.act.use(row.guid));
  if (!("ok" in useOutcome))
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
  const opened = await rt.mutex.run(() =>
    handle.objects.act.open(row.guid, choice.spellId),
  );
  if (!opened.ok) {
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
  return lootWindow(ctx, row, `Opened ${row.name}`);
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
  const useOutcome = await rt.mutex.run(() => handle.objects.act.use(row.guid));
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
  return lootWindow(ctx, row, `Opened ${row.name}`);
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
  stop: () => void;
};

function watchLoot(ctx: UseCtx): Watch {
  const { handle } = ctx;
  const offered: Offered[] = [];
  const pushed: LootLine[] = [];
  const taps = handle.onRewardsEvent((event) => {
    const state = event.state;
    if (event.type === "loot_opened" && state.loot.phase === "open")
      for (const item of state.loot.items)
        offered.push({
          count: item.count,
          itemId: item.itemId,
          slot: item.slot,
        });
    const push = state.lastItemPush;
    if (event.type === "item_push" && push)
      pushed.push({
        count: push.count,
        itemId: push.itemId,
        name: itemIdText(push.itemId),
        quality: null,
      });
  });
  return { offered, pushed, stop: taps };
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

async function lootWindow(
  ctx: UseCtx,
  row: ObjectRow,
  verb: string,
): Promise<ToolResult<UseAfter>> {
  const { handle, rt } = ctx;
  const waiter = new EventWaiter<RewardsEvent>();
  const off = handle.onRewardsEvent((event) => waiter.push(event));
  const watch = watchLoot(ctx);
  try {
    const outcome = await rt.mutex.run(() =>
      lootObject(objectLootRun(ctx, waiter), row.guid),
    );
    const lines = await nameLootLines(ctx, watch.pushed);
    const named = namedLines(
      watch.offered,
      outcome.ok ? (outcome.record?.slotsTaken ?? []) : [],
      lines,
    );
    if (!outcome.ok) {
      handle.abandonLoot();
      throw settleRefusal(row, outcome.cause);
    }
    const left = outcome.record?.slotsLeft ?? [];
    const taken = named.filter((line) =>
      (outcome.record?.slotsTaken ?? []).some(
        (slot) =>
          watch.offered.find((item) => item.slot === slot)?.itemId ===
          line.itemId,
      ),
    );
    const { detail, status } = openedDetail(
      verb,
      taken,
      outcome.record?.moneyTaken ?? 0,
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
  } finally {
    watch.stop();
    off();
  }
}
