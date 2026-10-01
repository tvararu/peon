import type {
  AreaActsOf,
  NamedInventorySlot,
  NamedInventoryState,
} from "@peon/core";
import type { InteractAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";

type BankResult = Awaited<ReturnType<AreaActsOf<"bank">["deposit"]>>;

import { bounded } from "@peon/core/lib/abort";
import { itemIdText, itemLabelIn } from "#harness/ops/item-names";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import {
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
} from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";

type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;

const LINE_NUMBER = /^\d+$/;
const ITEM_ID = /^item (\d+)$/;
const NO_ANSWER = "no_answer";
const MONEY_WAIT_MS = 500;

const CARRIED_REGIONS: Record<string, true> = {
  backpack: true,
  bag: true,
  bag_item: true,
  keyring: true,
};

const BANKED_REGIONS: Record<string, true> = {
  bank: true,
  bank_bag_item: true,
  bankbag: true,
};

import type { BankRow, BankView } from "#harness/contract/details";

function carriedOf(inventory: NamedInventoryState): Occupied[] {
  return inventory.slots.filter(
    (slot): slot is Occupied =>
      slot.status === "occupied" && slot.region in CARRIED_REGIONS,
  );
}

export function bankedOf(inventory: NamedInventoryState): Occupied[] {
  return [...(inventory.bank?.slots ?? [])].filter(
    (slot): slot is Occupied =>
      slot.status === "occupied" && slot.region in BANKED_REGIONS,
  );
}

function rowName(ctx: ToolCtx<InteractAfter>, slot: Occupied): string {
  if (slot.item.name) return slot.item.name;
  const entry = slot.item.entry;
  if (entry === undefined) return "an item";
  return itemLabelIn(ctx.handle)(entry)?.name ?? itemIdText(entry);
}

export function bankRows(
  rows: readonly Occupied[],
  ctx: ToolCtx<InteractAfter>,
): BankRow[] {
  return rows.map((slot, index) => ({
    bag: slot.bag,
    count: slot.item.count ?? 1,
    entry: slot.item.entry,
    line: index + 1,
    name: rowName(ctx, slot),
    slot: slot.slot,
  }));
}

function pickRefusal(
  verb: "deposit" | "withdraw",
  npc: NpcTarget,
  rows: readonly BankRow[],
  detail: string,
): Refusal {
  return new Refusal({
    body: rows.map((row) => `${row.line}. ${row.name} x${row.count}`),
    detail,
    next: nextCall("interact", { do: verb, npc: npc.unit.ref }),
    reason: verb === "deposit" ? "not_carried" : "not_in_bank",
  });
}

function matchRow(
  rows: readonly BankRow[],
  npc: NpcTarget,
  what: string,
  verb: "deposit" | "withdraw",
): BankRow {
  const trimmed = what.trim();
  if (LINE_NUMBER.test(trimmed)) {
    const found = rows.find((row) => row.line === Number(trimmed));
    if (found) return found;
  }
  const id = ITEM_ID.exec(trimmed);
  if (id) {
    const found = rows.find((row) => row.entry === Number(id[1]));
    if (found) return found;
  }
  const needle = trimmed.toLowerCase();
  const hits = rows.filter((row) => row.name.toLowerCase().includes(needle));
  if (hits.length > 0 && new Set(hits.map((row) => row.entry)).size === 1)
    return hits[0] as BankRow;
  if (hits.length > 1)
    throw new Refusal({
      body: hits.map((row) => `${row.line}. ${row.name} x${row.count}`),
      detail: `"${what}" matches ${hits.length} items: pick one by line number.`,
      next: nextCall("interact", { do: verb, npc: npc.unit.ref }),
      reason: "ambiguous_item",
    });
  throw pickRefusal(
    verb,
    npc,
    rows,
    verb === "deposit"
      ? `"${what}" is not in your bags.`
      : `"${what}" is not in the bank.`,
  );
}

function pickRow(
  rows: readonly BankRow[],
  npc: NpcTarget,
  what: string | undefined,
  verb: "deposit" | "withdraw",
): BankRow {
  if (rows.length === 0)
    throw pickRefusal(
      verb,
      npc,
      rows,
      verb === "deposit"
        ? "you carry nothing to deposit."
        : `${npcLabel(npc)} holds nothing to withdraw.`,
    );
  if (what !== undefined) return matchRow(rows, npc, what, verb);
  const only = rows[0];
  if (rows.length === 1 && only) return only;
  throw pickRefusal(
    verb,
    npc,
    rows,
    `say which item to ${verb}: what "<name>".`,
  );
}

function requireBanker(npc: NpcTarget): void {
  if (!npc.unit.roles.includes("banker"))
    throw new Refusal({
      detail: `${npcLabel(npc)} is not a banker.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: "not_banker",
    });
}

function openRefusal(npc: NpcTarget, outcome: BankResult): Refusal {
  if (outcome.status === "unanswered")
    return new Refusal({
      detail: `${npcLabel(npc)} did not open the bank in 5 s.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: NO_ANSWER,
      status: "UNCONFIRMED",
    });
  const reason = outcome.status === "refused" ? outcome.reason : outcome.status;
  return new Refusal({
    detail: `${npcLabel(npc)} refused the bank (${reason}).`,
    next: nextCall("interact", { npc: npc.unit.ref }),
    reason,
  });
}

async function ensureOpen(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<void> {
  if (ctx.handle.bank.state().banker === npc.guid) return;
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.handle.takeControl("manual_override");
    return await ctx.handle.bank.act.openBank(npc.guid);
  });
  if (outcome.status !== "ok") throw openRefusal(npc, outcome);
}

function freeBankSlots(inventory: NamedInventoryState): number | undefined {
  const bank = inventory.bank;
  if (bank === undefined) return undefined;
  return bank.slots.filter(
    (slot) =>
      slot.region === "bank" &&
      slot.bag === 255 &&
      slot.slot >= 39 &&
      slot.slot <= 66 &&
      slot.status === "empty",
  ).length;
}

function bankAfter(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
  rows: BankRow[],
): InteractAfter {
  const inventory = ctx.handle.getInventoryState();
  const bank: BankView = {
    bagSlots: ctx.handle.bank.state().bagSlots,
    free: freeBankSlots(inventory),
    known: true,
    lines: rows,
  };
  return { ...baseAfter(ctx, npc, "bank"), bank };
}

function bankListing(rows: readonly BankRow[]): string {
  return rows.length === 0
    ? "Bank: empty."
    : `Bank: ${rows.map((row) => `${row.line}. ${row.name} x${row.count}`).join("; ")}.`;
}

function bankBody(after: InteractAfter): string[] {
  const bank = after.bank;
  const freeText =
    bank?.free === undefined
      ? "free bank slots unknown"
      : `${bank.free} free bank slots`;
  const slotsText =
    bank?.bagSlots === undefined
      ? "bag slots unknown"
      : `${bank.bagSlots} bag slots`;
  return [bankListing(bank?.lines ?? []), `${freeText}. ${slotsText}.`];
}

async function waitMoneyMove(
  ctx: ToolCtx<InteractAfter>,
  before: number | undefined,
): Promise<number | undefined> {
  if (before === undefined) return undefined;
  const moved = Promise.withResolvers<number | undefined>();
  const off = ctx.handle.onEntityEvent(() => {
    const now = ctx.handle.getInventoryState().coinage;
    if (now !== undefined && now !== before) moved.resolve(now);
  });
  try {
    return await bounded(
      moved.promise,
      ctx.signal,
      MONEY_WAIT_MS,
      "no money update",
    );
  } catch {
    return undefined;
  } finally {
    off();
  }
}

export const bankStep: InteractStep = async ({ ctx, npc }) => {
  requireBanker(npc);
  await ensureOpen(ctx, npc);
  const after = bankAfter(
    ctx,
    npc,
    bankRows(bankedOf(ctx.handle.getInventoryState()), ctx),
  );
  const body = bankBody(after);
  return result("DONE", {
    after,
    body,
    detail: `${npcLabel(npc)} opened the bank. ${body.join(" ")}`,
  });
};

type MoveArgs = {
  npc: NpcTarget;
  verb: "deposit" | "withdraw";
  row: BankRow;
  outcome: BankResult;
  before: number | undefined;
};

function moveResult(
  ctx: ToolCtx<InteractAfter>,
  { npc, verb, row, outcome, before }: MoveArgs,
): ToolResult<InteractAfter> {
  const after = {
    ...baseAfter(ctx, npc, verb),
    money: moneyChange(ctx, before),
  };
  const done =
    verb === "deposit"
      ? `Deposited ${row.name} x${row.count}.`
      : `Withdrew ${row.name} x${row.count}.`;
  if (outcome.status === "ok")
    return result("DONE", {
      after,
      detail: `${done}${moneyText(after.money)}`,
    });
  if (outcome.status === "unanswered")
    return result("UNCONFIRMED", {
      after,
      detail: `${npcLabel(npc)} did not answer the ${verb} in 5 s.`,
      next: nextCall("interact", { do: verb, npc: npc.unit.ref }),
      reason: NO_ANSWER,
    });
  const reason = outcome.status === "refused" ? outcome.reason : outcome.status;
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} refused the ${verb} (${reason}).`,
    next: nextCall("interact", { do: verb, npc: npc.unit.ref }),
    reason,
  });
}

async function moveStep(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
  verb: "deposit" | "withdraw",
  what: string | undefined,
): Promise<ToolResult<InteractAfter>> {
  requireBanker(npc);
  await ensureOpen(ctx, npc);
  const inventory = ctx.handle.getInventoryState();
  const row = pickRow(
    bankRows(
      verb === "deposit" ? carriedOf(inventory) : bankedOf(inventory),
      ctx,
    ),
    npc,
    what,
    verb,
  );
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.handle.takeControl("manual_override");
    return verb === "deposit"
      ? await ctx.handle.bank.act.deposit(row.bag, row.slot)
      : await ctx.handle.bank.act.withdraw(row.bag, row.slot);
  });
  return moveResult(ctx, {
    before: inventory.coinage,
    npc,
    outcome,
    row,
    verb,
  });
}

export const depositStep: InteractStep = async ({ args, ctx, npc }) =>
  moveStep(ctx, npc, "deposit", args.what);

export const withdrawStep: InteractStep = async ({ args, ctx, npc }) =>
  moveStep(ctx, npc, "withdraw", args.what);

export const buyBankSlotStep: InteractStep = async ({ ctx, npc }) => {
  requireBanker(npc);
  await ensureOpen(ctx, npc);
  const before = ctx.handle.getInventoryState().coinage;
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.handle.takeControl("manual_override");
    return await ctx.handle.bank.act.buyBankSlot();
  });
  const moved = await waitMoneyMove(ctx, before);
  const after = {
    ...baseAfter(ctx, npc, "buy_bank_slot"),
    money:
      moved === undefined || before === undefined
        ? moneyChange(ctx, before)
        : { after: moved, before },
  };
  if (outcome.status === "ok") {
    const price =
      after.money === undefined
        ? ""
        : ` for ${after.money.before - after.money.after} copper`;
    return result("DONE", {
      after,
      detail: `Bought a bank bag slot${price}.${moneyText(after.money)}`,
    });
  }
  if (outcome.status === "unanswered")
    return result("UNCONFIRMED", {
      after,
      detail: `${npcLabel(npc)} did not answer the bank slot purchase in 5 s.`,
      next: nextCall("interact", {
        do: "buy_bank_slot",
        npc: npc.unit.ref,
      }),
      reason: NO_ANSWER,
    });
  const reason = outcome.status === "refused" ? outcome.reason : outcome.status;
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} refused the bank slot purchase (${reason}).`,
    next: nextCall("interact", {
      do: "buy_bank_slot",
      npc: npc.unit.ref,
    }),
    reason,
  });
};
