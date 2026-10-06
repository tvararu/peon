import { abortable } from "@peon/core/lib/abort";
import { named } from "#harness/areas/items/tool-resolve";
import {
  afterOf,
  settledOf,
  tabOf,
} from "#harness/areas/guildbank/tool-open";
import type {
  GuildBankAfter,
  GuildBankArgs,
  GuildBankCtx,
  GuildBankState,
} from "#harness/areas/guildbank/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { itemIdText } from "#harness/ops/item-names";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const GUILD_BANK_SLOTS = 98;

function refusal(reason: string, detail: string): Refusal {
  return new Refusal({
    detail,
    next: nextCall("guildbank", { do: "show" }),
    reason,
  });
}

function requireOpen(ctx: GuildBankCtx): GuildBankState {
  const state = ctx.handle.guildbank.state();
  if (state.vault === undefined)
    throw refusal(
      "vault_closed",
      "The guild vault is not open. Call guildbank with do open at a guild vault first.",
    );
  return state;
}

function itemLabel(
  ctx: GuildBankCtx,
  entry: number | undefined,
): string {
  if (entry === undefined || entry === 0) return "an item";
  return ctx.handle.itemLabel(entry).name ?? itemIdText(entry);
}

function tabLines(
  ctx: GuildBankCtx,
  state: GuildBankState,
  tab: number,
): string[] {
  const brief = state.briefs[tab];
  const head =
    brief && brief.name !== ""
      ? `Tab ${tab}: ${brief.name} (${brief.icon})`
      : `Tab ${tab}`;
  const slots = state.items.get(tab);
  const lines = [head];
  if (!slots || slots.size === 0) {
    lines.push("  empty");
    return lines;
  }
  for (const [slot, item] of [...slots].sort((a, b) => a[0] - b[0]))
    lines.push(
      `  slot ${slot}: ${item.count} ${itemLabel(ctx, item.entry)}`,
    );
  return lines;
}

export async function runShow(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  if (tab >= state.tabs)
    throw refusal(
      "no_such_tab",
      `Tab ${tab} is not bought yet (${state.tabs} tab${state.tabs === 1 ? "" : "s"} open).`,
    );
  const act = ctx.handle.guildbank.act;
  const queried = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.queryTab(tab), ctx.signal);
  });
  settledOf(queried, "show");
  const fresh = ctx.handle.guildbank.state();
  const lines = tabLines(ctx, fresh, tab);
  const text = fresh.texts[tab];
  if (text !== undefined && text !== "") lines.push(`  text: ${text}`);
  return result("DONE", {
    after: afterOf("show", tab, lines, fresh.money.toString(10)),
    body: lines,
    detail: lines.join("\n"),
  });
}

export async function runBuy(
  ctx: GuildBankCtx,
  _args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const next = state.tabs;
  if (next >= 6)
    throw refusal("no_more_tabs", "All 6 vault tabs are already bought.");
  const act = ctx.handle.guildbank.act;
  const bought = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.buyTab(next), ctx.signal);
  });
  settledOf(bought, "buy");
  const tabs = ctx.handle.guildbank.state().tabs;
  const detail = `Bought guild bank tab ${next} (${tabs} tabs now).`;
  return result("DONE", {
    after: afterOf("buy", next, [detail]),
    body: [detail],
    detail,
  });
}

export async function runRename(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  requireOpen(ctx);
  const tab = tabOf(args);
  const name = args.name?.trim() ?? "";
  const icon = args.icon?.trim() ?? "";
  if (name === "")
    throw refusal("missing_name", "Name the new tab name.");
  if (icon === "")
    throw refusal("missing_icon", "Name the new tab icon.");
  const act = ctx.handle.guildbank.act;
  const renamed = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.renameTab(tab, name, icon), ctx.signal);
  });
  settledOf(renamed, "rename");
  const detail = `Renamed tab ${tab} to ${name} (${icon}).`;
  return result("DONE", {
    after: afterOf("rename", tab, [detail]),
    body: [detail],
    detail,
  });
}

function copperOf(args: GuildBankArgs, verb: string): number {
  const copper = args.copper ?? 0;
  if (!Number.isInteger(copper) || copper <= 0)
    throw refusal(
      "bad_copper",
      `Copper ${String(args.copper)} is not a positive amount for ${verb}.`,
    );
  return copper;
}

export async function runDepositMoney(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  requireOpen(ctx);
  const copper = copperOf(args, "deposit_money");
  const coinage = ctx.handle.getInventoryState().coinage ?? 0;
  if (copper > coinage)
    throw refusal(
      "not_enough_money",
      `Copper ${copper} is above the coinage ${coinage}.`,
    );
  const act = ctx.handle.guildbank.act;
  const moved = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.depositMoney(copper), ctx.signal);
  });
  settledOf(moved, "deposit_money");
  const money = ctx.handle.guildbank.state().money.toString(10);
  const detail = `Deposited ${copper} copper; the vault holds ${money} copper.`;
  return result("DONE", {
    after: afterOf("deposit_money", 0, [detail], money),
    body: [detail],
    detail,
  });
}

export async function runWithdrawMoney(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  requireOpen(ctx);
  const copper = copperOf(args, "withdraw_money");
  const act = ctx.handle.guildbank.act;
  const moved = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.withdrawMoney(copper), ctx.signal);
  });
  settledOf(moved, "withdraw_money");
  const money = ctx.handle.guildbank.state().money.toString(10);
  const detail = `Withdrew ${copper} copper; the vault holds ${money} copper.`;
  return result("DONE", {
    after: afterOf("withdraw_money", 0, [detail], money),
    body: [detail],
    detail,
  });
}

export async function runDeposit(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  if (tab >= state.tabs)
    throw refusal("no_such_tab", `Tab ${tab} is not bought yet.`);
  const text = args.item?.trim() ?? "";
  if (text === "")
    throw refusal("missing_item", "Name the carried item to deposit.");
  const { held } = named(ctx.handle.getInventoryState(), text, [
    "backpack",
    "bag_item",
    "bag",
    "keyring",
  ]);
  const slots = state.items.get(tab) ?? new Map();
  const taken = new Set(slots.keys());
  let dest = args.slot;
  if (dest === undefined) {
    dest = 0;
    while (dest < GUILD_BANK_SLOTS && taken.has(dest)) dest += 1;
  }
  if (!Number.isInteger(dest) || dest < 0 || dest >= GUILD_BANK_SLOTS)
    throw refusal("bad_slot", `Slot ${String(args.slot)} is not a vault slot.`);
  if (taken.has(dest))
    throw refusal(
      "slot_taken",
      `Vault tab ${tab} slot ${dest} already holds an item.`,
    );
  const act = ctx.handle.guildbank.act;
  const moved = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(
      act.depositItem(held.bag, held.slot, tab, dest),
      ctx.signal,
    );
  });
  settledOf(moved, "deposit");
  const label = held.item.name ?? itemIdText(held.item.entry ?? 0);
  const detail = `Deposited ${label} in tab ${tab} slot ${dest}.`;
  return result("DONE", {
    after: afterOf("deposit", tab, [detail]),
    body: [detail],
    detail,
  });
}

export async function runWithdraw(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  const slot = args.slot ?? -1;
  if (!Number.isInteger(slot) || slot < 0 || slot >= GUILD_BANK_SLOTS)
    throw refusal("bad_slot", `Slot ${String(args.slot)} is not a vault slot.`);
  const seen = state.items.get(tab)?.get(slot);
  if (!seen || seen.entry === 0)
    throw refusal(
      "slot_empty",
      `Vault tab ${tab} slot ${slot} holds no item. Call show first.`,
    );
  const act = ctx.handle.guildbank.act;
  const moved = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(
      act.withdrawItem(tab, slot, args.bag ?? 255, args.slot ?? slot),
      ctx.signal,
    );
  });
  settledOf(moved, "withdraw");
  const detail = `Withdrew ${itemLabel(ctx, seen.entry)} from tab ${tab} slot ${slot}.`;
  return result("DONE", {
    after: afterOf("withdraw", tab, [detail]),
    body: [detail],
    detail,
  });
}

export async function runMove(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  const slot = args.slot ?? -1;
  if (!Number.isInteger(slot) || slot < 0 || slot >= GUILD_BANK_SLOTS)
    throw refusal("bad_slot", `Slot ${String(args.slot)} is not a vault slot.`);
  const seen = state.items.get(tab)?.get(slot);
  if (!seen || seen.entry === 0)
    throw refusal(
      "slot_empty",
      `Vault tab ${tab} slot ${slot} holds no item. Call show first.`,
    );
  const toTab = args.to_tab ?? tab;
  if (!Number.isInteger(toTab) || toTab < 0 || toTab >= state.tabs)
    throw refusal("bad_tab", `Tab ${String(args.to_tab)} is not bought yet.`);
  const toSlot = args.to_slot ?? -1;
  if (!Number.isInteger(toSlot) || toSlot < 0 || toSlot >= GUILD_BANK_SLOTS)
    throw refusal(
      "bad_slot",
      `Slot ${String(args.to_slot)} is not a vault slot.`,
    );
  if (toTab === tab && toSlot === slot)
    throw refusal("same_slot", "The source and destination are the same slot.");
  const occupied = state.items.get(toTab)?.get(toSlot);
  if (occupied && occupied.entry !== 0)
    throw refusal(
      "slot_taken",
      `Vault tab ${toTab} slot ${toSlot} already holds an item.`,
    );
  const act = ctx.handle.guildbank.act;
  const moved = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(
      act.moveWithinBank(tab, slot, toTab, toSlot),
      ctx.signal,
    );
  });
  settledOf(moved, "move");
  const detail = `Moved ${itemLabel(ctx, seen.entry)} from tab ${tab} slot ${slot} to tab ${toTab} slot ${toSlot}.`;
  return result("DONE", {
    after: afterOf("move", toTab, [detail]),
    body: [detail],
    detail,
  });
}

const LOG_NAMES: Record<number, string> = {
  1: "deposited item",
  2: "withdrew item",
  3: "moved item",
  4: "deposited money",
  5: "withdrew money",
  6: "withdrew repair money",
  7: "moved item",
  9: "bought tab",
};

export async function runLog(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  if (tab > 6)
    throw refusal("bad_tab", `Tab ${String(args.tab)} is not a log tab (0-6).`);
  void state;
  const act = ctx.handle.guildbank.act;
  const logged = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.queryLog(tab), ctx.signal);
  });
  settledOf(logged, "log");
  const entries = ctx.handle.guildbank.state().logs.get(tab) ?? [];
  const lines =
    entries.length === 0
      ? [`No log entries for tab ${tab}.`]
      : entries.map((entry) => {
          const what = LOG_NAMES[entry.type] ?? `event ${entry.type}`;
          if (entry.kind === "item" || entry.kind === "move")
            return `${what} ${entry.entry} x${entry.count}`;
          return `${what} ${entry.money} copper`;
        });
  return result("DONE", {
    after: afterOf("log", tab, lines),
    body: lines,
    detail: lines.join("\n"),
  });
}

export async function runText(
  ctx: GuildBankCtx,
  args: GuildBankArgs,
): Promise<ToolResult<GuildBankAfter>> {
  const state = requireOpen(ctx);
  const tab = tabOf(args);
  if (tab >= state.tabs)
    throw refusal("no_such_tab", `Tab ${tab} is not bought yet.`);
  const act = ctx.handle.guildbank.act;
  if (args.text !== undefined) {
    const changed = await ctx.rt.mutex.run(async () => {
      ctx.signal.throwIfAborted();
      return await abortable(
        act.setTabText(tab, args.text ?? ""),
        ctx.signal,
      );
    });
    settledOf(changed, "text");
  } else {
    const queried = await ctx.rt.mutex.run(async () => {
      ctx.signal.throwIfAborted();
      return await abortable(act.queryText(tab), ctx.signal);
    });
    settledOf(queried, "text");
  }
  const text = ctx.handle.guildbank.state().texts[tab] ?? "";
  const lines = [`Tab ${tab} text: ${text === "" ? "(empty)" : text}`];
  return result("DONE", {
    after: afterOf("text", tab, lines),
    body: lines,
    detail: lines.join("\n"),
  });
}

export async function runLimits(
  ctx: GuildBankCtx,
): Promise<ToolResult<GuildBankAfter>> {
  requireOpen(ctx);
  const act = ctx.handle.guildbank.act;
  const queried = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.queryMoneyWithdrawn(), ctx.signal);
  });
  settledOf(queried, "limits");
  const state = ctx.handle.guildbank.state();
  const money =
    state.moneyWithdrawn === undefined || state.moneyWithdrawn < 0
      ? "Daily money withdrawals are unlimited."
      : `${state.moneyWithdrawn} copper left to withdraw today.`;
  const lines = [money];
  for (const [tab, left] of [...state.tabWithdrawals].sort((a, b) => a[0] - b[0]))
    lines.push(
      left < 0
        ? `Tab ${tab}: unlimited withdrawals.`
        : `Tab ${tab}: ${left} withdrawals left today.`,
    );
  return result("DONE", {
    after: afterOf("limits", 0, lines),
    body: lines,
    detail: lines.join("\n"),
  });
}
