import {
  type ItemTemplate,
  type NamedInventorySlot,
  type NamedInventoryState,
  type QuestLogSlot,
  type QuestQuery,
  type QuestState,
  questSlotStatus,
  type SpellDefinition,
} from "@peon/core";
import { questRegion } from "#harness/areas/quests/reads";
import {
  dailyResetLine,
  reputationLines,
  reputationRows,
} from "#harness/areas/reputation/journal";
import { visibleSpellbook } from "#harness/areas/spells/book";
import { spellsJournalExtras } from "#harness/areas/spells/journal";
import type {
  BagRow,
  BagsView,
  EquipSlotName,
  JournalAfter,
  QuestLine,
  SpellLine,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { formatLogRows, queryLog } from "#harness/log/query";
import { questGoal, questTitle } from "#harness/ops/quest-memory";
import { defineGameTool, result } from "#harness/tools/define";
import {
  type BagMarkCtx,
  bagItemName,
  bagRow,
  secondsText,
} from "#harness/tools/journal-bags";
import { nextCall } from "#harness/tools/next-call";
import { type JournalArgs, journalParams } from "#harness/tools/params-journal";
import { journalRenderers } from "#harness/ui/renderers/card";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];
type LoggedSlot = QuestLogSlot & { questId: number };
type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;
type Ctx = ToolCtx<JournalAfter>;

const STOP = /[.!?]$/;
const QUEST_STATUS = {
  complete: "complete",
  failed: "failed",
  "in progress": "incomplete",
} as const;
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

function knownQuest(
  state: QuestState,
  questId: number,
): KnownQuest | undefined {
  const query = state.queries.find(
    (candidate) => candidate.questId === questId,
  );
  return query?.status === "known" ? query.data : undefined;
}

function killObjectives(
  slot: LoggedSlot,
  quest: KnownQuest | undefined,
): QuestLine["objectives"] {
  if (!quest) return [];
  return quest.targets.flatMap((target, index) => {
    if (target.count === 0) return [];
    const text = quest.objectiveTexts[index] || `objective ${index + 1}`;
    return [{ count: slot.counters[index] ?? 0, required: target.count, text }];
  });
}

function itemObjectives(
  state: QuestState,
  questId: number,
): QuestLine["objectives"] {
  const items = state.items.filter((item) => item.questId === questId);
  return items.map((item) => ({
    count: item.carried ?? 0,
    required: item.required,
    text: `item ${item.itemId}`,
  }));
}

type ShownQuest = QuestLine & { goal: string };

function questLine(ctx: Ctx, state: QuestState, slot: LoggedSlot): ShownQuest {
  const quest = knownQuest(state, slot.questId);
  const goal = questGoal(ctx, slot.questId);
  const status = QUEST_STATUS[questSlotStatus(slot)];
  const shown = {
    goal: goal.objectives.replace(STOP, ""),
    id: slot.questId,
    level: quest?.level,
    objectives: [
      ...killObjectives(slot, quest),
      ...itemObjectives(state, slot.questId),
    ],
    status,
    title: questTitle(ctx, slot.questId),
    turnIn: goal.ender,
  };
  const pose = ctx.handle.getControlState().pose ?? undefined;
  return {
    ...shown,
    region: questRegion(
      { id: shown.id, status },
      ctx.handle.quests.state().pois,
      pose,
    ),
  };
}

function turnInText(status: QuestLine["status"], turnIn: string | undefined) {
  if (turnIn) return ` Turn in to ${turnIn}.`;
  return status === "complete"
    ? ` Turn in to the NPC named in the goal; try ${nextCall("look", { find: "questgiver" })}.`
    : "";
}

function questText({
  goal,
  id,
  level,
  objectives,
  region,
  status,
  title,
  turnIn,
}: ShownQuest): string {
  const levelText = level ? ` (L${level})` : "";
  const counts = objectives
    .map((item) => `${item.text} ${item.count}/${item.required}`)
    .join(", ");
  const empty = status === "complete" ? "" : "no counted objectives";
  const goals = counts || goal || empty;
  const shown = goals === "" ? `${status}.` : `${goals}; ${status}.`;
  let where = "";
  if (region !== undefined)
    where = "none" in region ? " no map region." : ` ${region.label}.`;
  return `#${id} ${title}${levelText}: ${shown}${turnInText(status, turnIn)}${where}`;
}

function questsResult({ handle, rt }: Ctx): ToolResult<JournalAfter> {
  const state = handle.getQuestState();
  const logged = state.log.slots.filter(
    (slot): slot is LoggedSlot =>
      slot.questId !== undefined && slot.questId > 0,
  );
  const shown = logged.map((slot) =>
    questLine({ handle, rt } as Ctx, state, slot),
  );
  const quests = shown.map(({ goal: _goal, ...line }) => line);
  const first = shown.find(
    (line) => line.region !== undefined && !("none" in line.region),
  );
  const to =
    first?.region && "to" in first.region ? first.region.to : undefined;
  const reset = dailyResetLine(handle.time.state(), rt.clock.now());
  const detail = `${quests.length} quests. This is your quest log. To see what an NPC offers, use interact.`;
  return result("DONE", {
    after: { about: "quests", quests },
    body: [...(reset === undefined ? [] : [reset]), ...shown.map(questText)],
    detail,
    next: to === undefined ? undefined : nextCall("travel", { to }),
  });
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

function compactLines(bags: BagsView): string[] {
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
  if (lines.length === 0) return ["Bags: no items."];
  return lines;
}

function itemLines(bags: BagsView): string[] {
  const lines = bags.items.map(itemLine);
  if (bags.ammo !== undefined)
    lines.push(`Ammo: ${bags.ammo.name} (item ${bags.ammo.entry}).`);
  if (lines.length === 0) return ["Bags: no items."];
  if (lines.length > BAG_LINE_BUDGET) return compactLines(bags);
  return lines;
}

async function bagsResult({ handle }: Ctx): Promise<ToolResult<JournalAfter>> {
  const inventory = handle.getInventoryState();
  const bags = await bagsView(
    inventory,
    handle.getItemTemplate,
    handle.getSelfClass(),
    handle.getExperienceState().level,
  );
  const detail = `Money: ${moneyText(bags.copper)}. ${bags.freeSlots ?? "unknown"} free bag slots.`;
  return result("DONE", {
    after: { about: "bags", bags },
    body: [equippedLine(bags), ...itemLines(bags)],
    detail,
  });
}

function spellLine(spell: SpellDefinition): SpellLine {
  return {
    cooldownMs: spell.cooldown.recoveryTimeMs || undefined,
    cost: spell.power.costRaw || undefined,
    id: spell.id,
    name: spell.name,
    rank: spell.rank || undefined,
  };
}

function spellText({ cooldownMs, cost, name, rank }: SpellLine): string {
  const rankText = rank ? ` (${rank})` : "";
  const costText = cost ? `costs ${cost}` : "no cost";
  const cooldownText = cooldownMs
    ? `, cooldown ${Math.round(cooldownMs / 1000)} s`
    : "";
  return `${name}${rankText}: ${costText}${cooldownText}.`;
}

async function spellsResult({
  handle,
}: Ctx): Promise<ToolResult<JournalAfter>> {
  const spells = (await visibleSpellbook(handle))
    .map(spellLine)
    .sort((a, b) => a.name.localeCompare(b.name));
  const { auras, bar, lines } = spellsJournalExtras(handle);
  return result("DONE", {
    after: { about: "spells", auras, bar, spells },
    body: [...lines, ...spells.map(spellText)],
    detail: `${spells.length} spells known.`,
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

function journal(
  args: JournalArgs,
  ctx: Ctx,
): Promise<ToolResult<JournalAfter>> {
  if (args.about === "spells") return spellsResult(ctx);
  if (args.about === "quests") return Promise.resolve(questsResult(ctx));
  if (args.about === "bags") return bagsResult(ctx);
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
