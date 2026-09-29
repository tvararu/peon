import { auraName, isCancellable } from "#harness/areas/spells/tool-aura";
import { barLines, barText } from "#harness/areas/spells/tool-bar";
import type { AuraLine, BarLine } from "#harness/contract/details";
import type { Game } from "#harness/loops/game";

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
