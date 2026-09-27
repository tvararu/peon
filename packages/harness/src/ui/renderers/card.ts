import type { Theme } from "@earendil-works/pi-coding-agent";
import type {
  BagsView,
  InteractAfter,
  JournalAfter,
  LootLine,
  QuestLine,
  QuestOffer,
} from "#harness/contract/details";
import type { GameLogEntry } from "#harness/contract/log";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  entryGlyph,
  entryTone,
  glyph,
  hms,
  money,
  qualityTone,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitLabel,
} from "#harness/ui/renderers/line";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

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

function interactBody({ after, theme }: BodyInit<"interact">): string[] {
  const roles =
    after.roles.length > 0 ? theme.fg("dim", ` ${after.roles.join(", ")}`) : "";
  const last = after.money
    ? [
        theme.fg(
          "muted",
          `Last: ${money(theme, after.money.after)} (${signed(theme, after.money.before, after.money.after)})`,
        ),
      ]
    : [];
  return [
    `${unitLabel(theme, after.npc)}${roles}`,
    ...offerRows(after),
    ...shopRows(theme, after),
    ...last,
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

function lootBody({ after, theme }: BodyInit<"loot">): string[] {
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

function bagRows(theme: Theme, bags: BagsView): string[] {
  const g = glyphs();
  const purse = [
    bags.copper === undefined ? "" : money(theme, bags.copper),
    bags.freeSlots === undefined ? "" : `${g.bag} ${bags.freeSlots} free`,
  ];
  const worn = bags.equipped.map(
    (e) =>
      `${theme.fg("dim", e.slot)} ${theme.fg(qualityTone(e.quality), e.name)}`,
  );
  const items = bags.items.map(
    (item) =>
      `${g.item} ${theme.fg(qualityTone(item.quality), `${item.name} ×${item.count}`)} ${theme.fg("dim", item.kind)}`,
  );
  return [purse.filter(Boolean).join("  "), ...items, ...worn];
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
    case "spells":
      return after.spells.map(
        (s) => `${glyph("spell")} ${s.name}${s.rank ? ` (${s.rank})` : ""}`,
      );
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

function journalBody({ after, theme }: BodyInit<"journal">): string[] {
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

export const interactRenderers: ToolRenderers = {
  renderCall: callRenderer(interactCall),
  renderResult: resultRenderer("interact", interactBody),
};

export const lootRenderers: ToolRenderers = {
  renderCall: callRenderer(lootCall),
  renderResult: resultRenderer("loot", lootBody),
};

export const journalRenderers: ToolRenderers = {
  renderCall: callRenderer(journalCall),
  renderResult: resultRenderer("journal", journalBody),
};
