import type {
  ItemTemplate,
  NamedInventorySlot,
  NamedInventoryState,
} from "@peon/core";
import { questsResult } from "#harness/areas/quests/journal";
import {
  reputationLines,
  reputationRows,
} from "#harness/areas/reputation/journal";
import { spellsResult } from "#harness/areas/spells/journal";
import type {
  BagRow,
  BagsView,
  EquipSlotName,
  JournalAfter,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { formatLogRows, queryLog } from "#harness/log/query";
import { defineGameTool, result } from "#harness/tools/define";
import {
  type BagMarkCtx,
  bagItemName,
  bagRow,
  secondsText,
} from "#harness/tools/journal-bags";
import { bankBodyOf, bankViewOf } from "#harness/tools/journal-bank";
import { mailBodyOf, mailViewOf } from "#harness/tools/journal-mail";
import { type JournalArgs, journalParams } from "#harness/tools/params-journal";
import { journalRenderers } from "#harness/ui/renderers/card";

type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;
type Ctx = ToolCtx<JournalAfter>;

function equippedRow(slot: Occupied, name: EquipSlotName) {
  const current = slot.item.durability;
  const observed = slot.item.maxDurability;
  const durability =
    current === undefined ||
    observed === undefined ||
    observed <= 0 ||
    current >= observed / 4
      ? undefined
      : { current, max: observed };
  return {
    durability,
    name: bagItemName(slot),
    quality: slot.item.quality,
    slot: name,
  };
}
const BAG_REGIONS: ReadonlySet<string> = new Set(["backpack", "bag_item"]);
const EQUIP_SLOTS: readonly EquipSlotName[] = [
  "head",
  "neck",
  "shoulders",
  "shirt",
  "chest",
  "waist",
  "legs",
  "feet",
  "wrists",
  "hands",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "back",
  "main_hand",
  "off_hand",
  "ranged",
  "tabard",
];

function emptyJournal(): JournalAfter {
  return { about: "log", label: "", more: 0, rows: [] };
}

function reputationResult(
  args: JournalArgs,
  { handle }: Ctx,
): ToolResult<JournalAfter> {
  const state = handle.reputation.state();
  const rows = reputationRows(state, args.find);
  const lines = reputationLines(state, args.find);
  const names = rows.map((row) => row.name ?? `Faction ${row.repListId}`);
  return result("DONE", {
    after: { about: "reputation", factions: names },
    body: lines,
    detail: `${rows.length} factions. This is your reputation with each faction.`,
  });
}
async function bagsView(
  inventory: NamedInventoryState,
  getItemTemplate: Ctx["handle"]["getItemTemplate"],
  playerClass: string | undefined,
  playerLevel: number | undefined,
): Promise<BagsView> {
  const occupied = inventory.slots.filter(
    (slot): slot is Occupied => slot.status === "occupied",
  );
  const equipped = occupied.flatMap((slot) => {
    const name = EQUIP_SLOTS[slot.slot];
    return slot.region === "equipment" && name !== undefined
      ? [equippedRow(slot, name)]
      : [];
  });
  const entries = [
    ...new Set(
      occupied.flatMap((slot) =>
        slot.item.entry === undefined ? [] : [slot.item.entry],
      ),
    ),
  ];
  const found = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      template: await getItemTemplate(entry).catch(() => undefined),
    })),
  );
  const templates: Record<number, ItemTemplate | undefined> = {};
  for (const row of found) templates[row.entry] = row.template;
  const mark: BagMarkCtx = { inventory, playerClass, playerLevel, templates };
  const items = occupied
    .filter((slot) => BAG_REGIONS.has(slot.region))
    .map((slot) =>
      bagRow(
        slot,
        slot.item.entry === undefined ? undefined : templates[slot.item.entry],
        mark,
      ),
    );
  const ammoEntry = inventory.ammoId;
  const ammoSlot =
    ammoEntry === undefined
      ? undefined
      : occupied.find((slot) => slot.item.entry === ammoEntry);
  const ammoName = ammoSlot ? bagItemName(ammoSlot) : undefined;
  return {
    ammo:
      ammoEntry !== undefined && ammoName !== undefined
        ? { entry: ammoEntry, name: ammoName }
        : undefined,
    copper: inventory.coinage,
    equipped,
    freeSlots: inventory.freeSlots,
    items,
  };
}

function moneyText(copper: number | undefined): string {
  if (copper === undefined) return "unknown";
  const parts = [
    [Math.floor(copper / 10_000), "g"],
    [Math.floor((copper % 10_000) / 100), "s"],
    [copper % 100, "c"],
  ] as const;
  const shown = parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount}${unit}`);
  return shown.length > 0 ? shown.join(" ") : "0c";
}

function equippedLine({ equipped }: BagsView): string {
  const worn = equipped
    .map((item) =>
      item.durability === undefined
        ? `${item.slot.replace("_", " ")} ${item.name}`
        : `${item.slot.replace("_", " ")} ${item.name} (durability ${item.durability.current}/${item.durability.max})`,
    )
    .join(", ");
  return `Equipped: ${worn || "nothing"}.`;
}

function itemLine(item: BagRow): string {
  const marks: string[] = [];
  if (item.canWear === true)
    marks.push(
      item.upgrade === undefined
        ? "can wear"
        : `can wear, upgrade (item level ${item.upgrade.itemLevel}, worn ${item.upgrade.wornItemLevel})`,
    );
  if (item.canWear === false)
    marks.push(
      item.requiredLevel === undefined
        ? "cannot wear (class)"
        : `cannot wear (needs level ${item.requiredLevel})`,
    );
  if (item.durability !== undefined)
    marks.push(`durability ${item.durability.current}/${item.durability.max}`);
  if (item.secondsLeft !== undefined) marks.push(secondsText(item.secondsLeft));
  if (item.loadedAmmo) marks.push("loaded ammo");
  const head = `bag ${item.bag} slot ${item.slot}: ${item.name} x${item.count} (item ${item.entry ?? 0})`;
  return marks.length > 0 ? `${head}: ${marks.join(", ")}.` : `${head}.`;
}

const BAG_LINE_BUDGET = 21;

function shortItem(bag: number, item: BagRow): string {
  const marks: string[] = [];
  if (item.upgrade !== undefined) marks.push("upgrade");
  else if (item.canWear === true) marks.push("wear");
  if (item.durability !== undefined) marks.push("low dura");
  if (item.secondsLeft !== undefined) marks.push(secondsText(item.secondsLeft));
  if (item.loadedAmmo) marks.push("ammo");
  const head = `bag ${bag} slot ${item.slot} ${item.name} x${item.count} (item ${item.entry ?? 0})`;
  return marks.length > 0 ? `${head} (${marks.join(", ")})` : head;
}

function compactLines(bags: BagsView, sold: string | undefined): string[] {
  const groups: Record<number, BagRow[]> = {};
  for (const item of bags.items) {
    const rows = groups[item.bag] ?? [];
    rows.push(item);
    groups[item.bag] = rows;
  }
  const lines = Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(
      ([bag, rows]) =>
        `bag ${bag}: ${rows.map((item) => shortItem(Number(bag), item)).join("; ")}.`,
    );
  if (bags.ammo !== undefined)
    lines.push(`Ammo: ${bags.ammo.name} (item ${bags.ammo.entry}).`);
  if (sold !== undefined) lines.push(sold);
  if (lines.length === 0) return ["Bags: no items."];
  return lines;
}

function buybackLine(ctx: Ctx): string | undefined {
  const list = ctx.handle.buyback.state().list;
  if (list.length === 0) return undefined;
  const rows = list.map((row) => {
    const count = row.count ?? 1;
    const name =
      row.entry === undefined
        ? "an item"
        : (ctx.handle.itemLabel(row.entry).name ?? `item ${row.entry}`);
    return row.price === undefined
      ? `${name} x${count}`
      : `${name} x${count} for ${row.price} copper`;
  });
  return `Buyback: ${rows.join("; ")}.`;
}

function itemLines(bags: BagsView, sold: string | undefined): string[] {
  const lines = bags.items.map(itemLine);
  if (bags.ammo !== undefined)
    lines.push(`Ammo: ${bags.ammo.name} (item ${bags.ammo.entry}).`);
  if (lines.length === 0 && sold === undefined) return ["Bags: no items."];
  if (sold !== undefined && lines.length <= BAG_LINE_BUDGET) lines.push(sold);
  if (lines.length === 0) return ["Bags: no items."];
  if (lines.length > BAG_LINE_BUDGET) return compactLines(bags, sold);
  return lines;
}

async function bagsResult(ctx: Ctx): Promise<ToolResult<JournalAfter>> {
  const inventory = ctx.handle.getInventoryState();
  const bags = await bagsView(
    inventory,
    ctx.handle.getItemTemplate,
    ctx.handle.getSelfClass(),
    ctx.handle.getExperienceState().level,
  );
  const sold = buybackLine(ctx);
  const detail = `Money: ${moneyText(bags.copper)}. ${bags.freeSlots ?? "unknown"} free bag slots.`;
  return result("DONE", {
    after: { about: "bags", bags },
    body: [equippedLine(bags), ...itemLines(bags, sold)],
    detail,
  });
}

function logResult(args: JournalArgs, { rt }: Ctx): ToolResult<JournalAfter> {
  const now = rt.clock.now();
  const query = { find: args.find, since: args.since };
  const page = queryLog({
    log: rt.log,
    now,
    query,
    runs: rt.runs,
    turnStartSeq: rt.session.turnStartSeq,
  });
  const older =
    page.more > 0 ? [`+${page.more} more; narrow with find or since.`] : [];
  const detail = `${page.rows.length + page.more} events ${page.label}${page.rows.length > 0 ? ":" : "."}`;
  const after: JournalAfter = {
    about: "log",
    label: page.label,
    more: page.more,
    rows: page.rows,
  };
  return result("DONE", {
    after,
    body: [...formatLogRows(page.rows, now), ...older],
    detail,
  });
}

function bankResult(ctx: Ctx): ToolResult<JournalAfter> {
  const inventory = ctx.handle.getInventoryState();
  const view = bankViewOf(inventory);
  const bagSlots = ctx.handle.bank.state().bagSlots;
  const body = bankBodyOf(view, bagSlots);
  const detail =
    view.free === undefined
      ? "Bank: unknown."
      : `${view.lines.length} bank items. ${view.free} free bank slots.`;
  return result("DONE", {
    after: { about: "bank", bank: { ...view, bagSlots } },
    body,
    detail,
  });
}

function mailResult(ctx: Ctx): ToolResult<JournalAfter> {
  const state = ctx.handle.mail.state();
  const labelOf = (entry: number) =>
    ctx.handle.itemLabel(entry).name ?? undefined;
  const view = mailViewOf(state.inbox, state.unread, labelOf);
  const body = mailBodyOf(view);
  const detail =
    view.lines.length === 0
      ? "Mail: empty."
      : `${view.lines.length} waiting letter${view.lines.length === 1 ? "" : "s"}.`;
  return result("DONE", {
    after: { about: "mail", mail: view },
    body,
    detail,
  });
}

function journal(
  args: JournalArgs,
  ctx: Ctx,
): Promise<ToolResult<JournalAfter>> {
  if (args.about === "spells") return spellsResult(ctx);
  if (args.about === "quests") return Promise.resolve(questsResult(ctx));
  if (args.about === "bags") return bagsResult(ctx);
  if (args.about === "bank") return Promise.resolve(bankResult(ctx));
  if (args.about === "mail") return Promise.resolve(mailResult(ctx));
  if (args.about === "reputation")
    return Promise.resolve(reputationResult(args, ctx));
  return Promise.resolve(logResult(args, ctx));
}

export const journalTool = defineGameTool({
  fallback: emptyJournal,
  kind: "read",
  maxLines: 24,
  minimalArgs: { about: "quests" },
  name: "journal",
  parameters: journalParams,
  renderers: journalRenderers,
  run: journal,
  text: {
    description:
      "Reads your own records: your quest log, your bags and equipped items, the spells you know, your reputation with each faction, or the game log of what happened earlier. It does not move you or act.",
    guidelines: [
      "log is history. It never loses events when you read it.",
      "Use bags to name an equipped item, for example the item in your main hand.",
    ],
    label: "Journal",
  },
});
