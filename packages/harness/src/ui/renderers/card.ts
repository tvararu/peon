import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  AuraLine,
  BagRow,
  BagsView,
  BarLine,
  InteractAfter,
  JournalAfter,
  LootAfter,
  LootLine,
  QuestLine,
  QuestOffer,
  SpellLine,
} from "#harness/contract/details";
import type { GameLogEntry } from "#harness/contract/log";
import type { ToolRenderers } from "#harness/tools/game-tool";
import { secondsText } from "#harness/tools/journal-bags";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  entryGlyph,
  entryTone,
  glyph,
  hms,
  money,
  qualityTone,
  span,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitLabel,
} from "#harness/ui/renderers/line";

const OFFER_GLYPH: Readonly<Record<QuestOffer["state"], GlyphName>> = {
  available: "questAvailable",
  incomplete: "questInProgress",
  ready: "questComplete",
};

const QUEST_GLYPH: Readonly<Record<QuestLine["status"], GlyphName>> = {
  complete: "questComplete",
  failed: "questFailed",
  incomplete: "questInProgress",
};

function itemText(theme: Theme, item: LootLine): string {
  return theme.fg(qualityTone(item.quality), `${item.name} ×${item.count}`);
}

function signed(theme: Theme, before: number, after: number): string {
  const delta = after - before;
  return `${delta < 0 ? "-" : "+"}${money(theme, Math.abs(delta))}`;
}

function offerRows(after: InteractAfter): string[] {
  const g = glyphs();
  const offers = after.offers.map(
    (o) =>
      `${g[OFFER_GLYPH[o.state]]} ${o.line}. ${o.title}${o.level === undefined ? "" : ` [${o.level}]`}`,
  );
  const gossip = after.gossip.map(
    (line) => `${g.say} ${line.line}. ${line.text}`,
  );
  const choices = after.rewardChoices.map(
    (choice) =>
      `${g.item} reward ${choice.index}. ${choice.name} ×${choice.count}`,
  );
  return [...offers, ...gossip, ...choices];
}

function shopRows(theme: Theme, after: InteractAfter): string[] {
  const g = glyphs();
  const stock = after.stock.map(
    (s) =>
      `${g.vendor} ${s.line}. ${s.name} ×${s.stack} ${money(theme, s.price)}`,
  );
  const spells = after.spells.map(
    (s) =>
      `${g.trainer} ${s.name}${s.rank ? ` (${s.rank})` : ""} L${s.level} ${money(theme, s.cost)} ${s.state}`,
  );
  const bought = after.bought
    ? [`bought ${itemText(theme, after.bought)}`]
    : [];
  const sold =
    after.sold.length > 0
      ? [`sold ${after.sold.map((item) => itemText(theme, item)).join(", ")}`]
      : [];
  const learned =
    after.learned.length > 0 ? [`learned ${after.learned.join(", ")}`] : [];
  const repair =
    after.repairCost === undefined
      ? []
      : [`repair ${money(theme, after.repairCost)}`];
  return [...stock, ...spells, ...bought, ...sold, ...learned, ...repair];
}

function moneyRows(theme: Theme, after: InteractAfter): string[] {
  const change = after.money;
  if (!change) return [];
  const last = `Last: ${money(theme, change.after)}`;
  if (change.after === change.before) return [theme.fg("muted", last)];
  const delta = signed(theme, change.before, change.after);
  if (after.action === "turn_in")
    return [
      `${theme.fg("success", `Reward: ${delta}`)} ${theme.fg("muted", `· ${last}`)}`,
    ];
  return [theme.fg("muted", `${last} (${delta})`)];
}

function npcRow(theme: Theme, after: InteractAfter): string[] {
  if (after.npc.ref === "") return [];
  const roles =
    after.roles.length > 0 ? theme.fg("dim", ` ${after.roles.join(", ")}`) : "";
  return [`${unitLabel(theme, after.npc)}${roles}`];
}

function interactBody({ after, theme }: BodyInit<InteractAfter>): string[] {
  return [
    ...npcRow(theme, after),
    ...offerRows(after),
    ...shopRows(theme, after),
    ...moneyRows(theme, after),
  ];
}

function interactCall(args: unknown, theme: Theme): string {
  const parts = [
    argText(args, "npc") ?? "?",
    argText(args, "do") ?? "talk",
    argText(args, "what"),
  ];
  return callLine({ icon: "questgiver", parts, theme, verb: "interact" });
}

function lootBody({ after, theme }: BodyInit<LootAfter>): string[] {
  const g = glyphs();
  const corpse = after.corpse
    ? unitLabel(theme, after.corpse)
    : theme.fg("dim", `${g.corpse} corpse`);
  const items = after.items.map((item) => `${g.loot} ${itemText(theme, item)}`);
  const coins = after.copper > 0 ? [money(theme, after.copper)] : [];
  const bag =
    after.freeSlots === undefined
      ? []
      : [theme.fg("muted", `${g.bag} ${after.freeSlots} free`)];
  const open = after.windowClosed
    ? []
    : [theme.fg("warning", `${g.warning} the loot window is still open`)];
  return [corpse, ...items, ...coins, ...bag, ...open];
}

function lootCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "loot",
    parts: [argText(args, "target") ?? "nearest corpse"],
    theme,
    verb: "loot",
  });
}

function questRows(theme: Theme, quests: readonly QuestLine[]): string[] {
  const g = glyphs();
  return quests.flatMap((q) => {
    const icon = theme.fg(
      q.status === "complete" ? "success" : "warning",
      g[QUEST_GLYPH[q.status]],
    );
    const head = `${icon} ${q.title}${q.level === undefined ? "" : ` [${q.level}]`}`;
    const turnIn =
      q.status === "complete" && q.turnIn
        ? theme.fg("success", ` → ${g.questgiver} ${q.turnIn}`)
        : "";
    const goals = q.objectives.map((o) =>
      theme.fg(
        o.count >= o.required ? "dim" : "text",
        `  ${o.count}/${o.required} ${o.text}`,
      ),
    );
    return [`${head}${turnIn}`, ...goals];
  });
}

function itemMarks(item: BagRow): string {
  const marks: string[] = [];
  if (item.upgrade !== undefined) marks.push("upgrade");
  else if (item.canWear === true) marks.push("wear");
  else if (item.canWear === false)
    marks.push(
      item.requiredLevel === undefined
        ? "cannot wear"
        : `needs level ${item.requiredLevel}`,
    );
  if (item.durability !== undefined)
    marks.push(`low dura ${item.durability.current}/${item.durability.max}`);
  if (item.loadedAmmo) marks.push("loaded");
  if (item.secondsLeft !== undefined) marks.push(secondsText(item.secondsLeft));
  return marks.length > 0 ? ` · ${marks.join(", ")}` : "";
}

function bagRows(theme: Theme, bags: BagsView): string[] {
  const g = glyphs();
  const purse = [
    bags.copper === undefined ? "" : money(theme, bags.copper),
    bags.freeSlots === undefined ? "" : `${g.bag} ${bags.freeSlots} free`,
  ]
    .filter(Boolean)
    .join("  ");
  const items = bags.items.map((item) => {
    const head = `${g.item} ${theme.fg(qualityTone(item.quality), `${item.name} ×${item.count}`)} ${theme.fg("dim", item.kind)}`;
    return `${head}${theme.fg("dim", itemMarks(item))}`;
  });
  const worn = bags.equipped.map((e) => {
    const dura =
      e.durability === undefined
        ? ""
        : theme.fg("dim", ` ${e.durability.current}/${e.durability.max}`);
    return `${theme.fg("dim", e.slot)} ${theme.fg(qualityTone(e.quality), e.name)}${dura}`;
  });
  const ammo =
    bags.ammo === undefined
      ? []
      : [`${theme.fg("dim", "Ammo")} ${bags.ammo.name}`];
  return [...(purse ? [purse] : []), ...items, ...worn, ...ammo];
}

type SpellRowsInit = {
  auras: readonly AuraLine[];
  bar: readonly BarLine[];
  spells: readonly SpellLine[];
  theme: Theme;
};

function spellRows({ auras, bar, spells, theme }: SpellRowsInit): string[] {
  const lines = spells.map((s) => {
    const head = `${glyph("spell")} ${s.name}${s.rank ? ` (${s.rank})` : ""}`;
    const bits = [
      s.cost === undefined ? "" : `${s.cost}`,
      s.cooldownMs === undefined ? "" : span(s.cooldownMs),
    ].filter(Boolean);
    return bits.length > 0
      ? `${head} ${theme.fg("dim", bits.join(" · "))}`
      : head;
  });
  if (auras.length > 0)
    lines.push(
      theme.fg("muted", "Auras"),
      ...auras.map((a) => `${glyph("buff")} ${theme.fg("text", a.name)}`),
    );
  if (bar.length > 0)
    lines.push(
      theme.fg("muted", "Bar"),
      ...bar.map((entry) => {
        if (entry.type === "spell")
          return `${theme.fg("dim", `${entry.slot}`)} ${glyph("spell")} ${theme.fg("text", entry.name)}`;
        if (entry.type === "item")
          return `${theme.fg("dim", `${entry.slot}`)} ${glyphs().item} ${theme.fg("text", entry.name)}`;
        return `${theme.fg("dim", `${entry.slot}`)} ${theme.fg("dim", entry.type === "macro" ? "macro" : "set")} ${theme.fg("text", entry.name)}`;
      }),
    );
  return lines;
}

function logRow(theme: Theme, entry: GameLogEntry): string {
  const tone = entryTone(entry);
  return `${theme.fg("dim", hms(entry.ts))} ${theme.fg(tone, entryGlyph(entry))} ${theme.fg(tone, entry.text)}`;
}

function journalRows(theme: Theme, after: JournalAfter): string[] {
  switch (after.about) {
    case "quests":
      return questRows(theme, after.quests);
    case "bags":
      return bagRows(theme, after.bags);
    case "reputation":
      return after.factions.map((name) => `${glyph("spell")} ${name}`);
    case "spells":
      return spellRows({
        auras: after.auras,
        bar: after.bar,
        spells: after.spells,
        theme,
      });
    default: {
      const more =
        after.more > 0 ? [theme.fg("dim", `+${after.more} more`)] : [];
      return [
        theme.fg("muted", after.label),
        ...after.rows.map((entry) => logRow(theme, entry)),
        ...more,
      ];
    }
  }
}

function journalBody({ after, theme }: BodyInit<JournalAfter>): string[] {
  return journalRows(theme, after);
}

function journalCall(args: unknown, theme: Theme): string {
  const find = argText(args, "find");
  const parts = [
    argText(args, "about") ?? "?",
    find && `"${find}"`,
    argText(args, "since"),
  ];
  return callLine({ icon: "questLog", parts, theme, verb: "journal" });
}

export const interactRenderers: ToolRenderers<"interact", InteractAfter> = {
  renderCall: callRenderer(interactCall),
  renderResult: resultRenderer("interact", interactBody),
};

export const lootRenderers: ToolRenderers<"loot", LootAfter> = {
  renderCall: callRenderer(lootCall),
  renderResult: resultRenderer("loot", lootBody),
};

export const journalRenderers: ToolRenderers<"journal", JournalAfter> = {
  renderCall: callRenderer(journalCall),
  renderResult: resultRenderer("journal", journalBody),
};
