import type { SpellDefinition } from "@peon/core";
import { visibleSpellbook } from "#harness/areas/spells/book";
import { auraName, isCancellable } from "#harness/areas/spells/tool-aura";
import { barLines, barText } from "#harness/areas/spells/tool-bar";
import type {
  AuraLine,
  BarLine,
  JournalAfter,
  SpellLine,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { OpsCtx } from "#harness/contract/services";
import type { Game } from "#harness/loops/game";
import { result } from "#harness/tools/define";

const LINES_PER_BLOCK = 4;

function capped(lines: string[], more: string): string[] {
  if (lines.length <= LINES_PER_BLOCK) return lines;
  const shown = lines.slice(0, LINES_PER_BLOCK - 1);
  return [...shown, `+${lines.length - shown.length} more ${more}.`];
}

function cancellableAuras(handle: Game): AuraLine[] {
  return handle
    .getCombatState()
    .auras.filter((aura) => isCancellable(handle, aura))
    .map((aura) => ({ name: auraName(handle, aura), spellId: aura.spellId }));
}

export function spellsJournalExtras(handle: Game): {
  auras: AuraLine[];
  bar: BarLine[];
  lines: string[];
} {
  const auras = cancellableAuras(handle);
  const bar = barLines(handle);
  const auraRows = auras.map(
    ({ name, spellId }) => `Aura you can cancel: ${name} (spell ${spellId}).`,
  );
  const barRows = bar.map((line) => `Bar ${barText(line)}.`);
  return {
    auras,
    bar,
    lines: [
      ...capped(auraRows, "auras you can cancel"),
      ...capped(barRows, "bar slots"),
    ],
  };
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

export async function spellsResult({
  handle,
}: OpsCtx): Promise<ToolResult<JournalAfter>> {
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
