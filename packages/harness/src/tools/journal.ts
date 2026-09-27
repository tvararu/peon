import {
  itemKind,
  type NamedInventorySlot,
  type NamedInventoryState,
  type QuestLogSlot,
  type QuestQuery,
  type QuestState,
  questSlotStatus,
  type SpellDefinition,
} from "@tuicraft/core";
import type {
  BagsView,
  EquipSlotName,
  JournalAfter,
  QuestLine,
  SpellLine,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { formatLogRows, queryLog } from "#harness/log/query";
import { defineGameTool, result } from "#harness/tools/define";
import { type JournalArgs, journalParams } from "#harness/tools/params";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];
type LoggedSlot = QuestLogSlot & { questId: number };
type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;
type Ctx = ToolCtx<JournalAfter>;

const ITEMS_PER_LINE = 6;
const QUEST_STATUS = {
  complete: "complete",
  failed: "failed",
  "in progress": "incomplete",
} as const;
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

function questLine(state: QuestState, slot: LoggedSlot): QuestLine {
  const quest = knownQuest(state, slot.questId);
  return {
    id: slot.questId,
    level: quest?.level,
    objectives: [
      ...killObjectives(slot, quest),
      ...itemObjectives(state, slot.questId),
    ],
    status: QUEST_STATUS[questSlotStatus(slot)],
    title: quest?.title ?? `quest ${slot.questId}`,
    turnIn: undefined,
  };
}

function questText({
  id,
  level,
  objectives,
  status,
  title,
}: QuestLine): string {
  const levelText = level ? ` (L${level})` : "";
  const goals =
    objectives
      .map((goal) => `${goal.text} ${goal.count}/${goal.required}`)
      .join(", ") || "no counted objectives";
  return `#${id} ${title}${levelText}: ${goals}; ${status}.`;
}

function questsResult({ handle }: Ctx): ToolResult<JournalAfter> {
  const state = handle.getQuestState();
  const logged = state.log.slots.filter(
    (slot): slot is LoggedSlot =>
      slot.questId !== undefined && slot.questId > 0,
  );
  const quests = logged.map((slot) => questLine(state, slot));
  const detail = `${quests.length} quests. This is your quest log. To see what an NPC offers, use interact.`;
  return result("DONE", {
    after: { about: "quests", quests },
    body: quests.map(questText),
    detail,
  });
}

function itemName(slot: Occupied): string {
  return slot.item.name ?? `item ${slot.item.entry ?? 0}`;
}

function bagsView(inventory: NamedInventoryState): BagsView {
  const occupied = inventory.slots.filter(
    (slot): slot is Occupied => slot.status === "occupied",
  );
  const equipped = occupied.flatMap((slot) => {
    const name = EQUIP_SLOTS[slot.slot];
    return slot.region === "equipment" && name
      ? [{ name: itemName(slot), quality: slot.item.quality, slot: name }]
      : [];
  });
  const items = occupied
    .filter((slot) => BAG_REGIONS.has(slot.region))
    .map((slot) => ({
      bag: slot.bag,
      count: slot.item.count ?? 1,
      kind: itemKind(slot.item),
      name: itemName(slot),
      quality: slot.item.quality,
      slot: slot.slot,
    }));
  return {
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
    .map((item) => `${item.slot.replace("_", " ")} ${item.name}`)
    .join(", ");
  return `Equipped: ${worn || "nothing"}.`;
}

function itemLines({ items }: BagsView): string[] {
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(item.name, (counts.get(item.name) ?? 0) + item.count);
  const words = [...counts].map(([name, count]) => `${name} x${count}`);
  if (words.length === 0) return ["Bags: no items."];
  const lines: string[] = [];
  for (let start = 0; start < words.length; start += ITEMS_PER_LINE)
    lines.push(words.slice(start, start + ITEMS_PER_LINE).join(", "));
  return lines.map((line, index) =>
    index === 0 ? `Bags: ${line}.` : `${line}.`,
  );
}

function bagsResult({ handle }: Ctx): ToolResult<JournalAfter> {
  const bags = bagsView(handle.getInventoryState());
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
  const spells = (await handle.getSpellbook())
    .map(spellLine)
    .sort((a, b) => a.name.localeCompare(b.name));
  return result("DONE", {
    after: { about: "spells", spells },
    body: spells.map(spellText),
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
  if (args.about === "bags") return Promise.resolve(bagsResult(ctx));
  return Promise.resolve(logResult(args, ctx));
}

export const journalTool = defineGameTool({
  fallback: emptyJournal,
  kind: "read",
  maxLines: 24,
  name: "journal",
  parameters: journalParams,
  run: journal,
});
