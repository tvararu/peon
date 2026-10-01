import {
  asCatalog,
  freePointsOf,
  heldRanks,
  NAMES_NEED_DATA,
  spellLabel,
  type TalentsAfter,
  type TalentsCatalog,
  type TalentsCtx,
  type TalentsSnapshot,
} from "#harness/areas/talents/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { result } from "#harness/tools/define";

const GLYPH_KINDS: Record<number, string> = { 0: "major", 1: "minor" };

export function kindOf(typeFlags: number | undefined): string {
  if (typeFlags === undefined) return "unknown";
  return GLYPH_KINDS[typeFlags] ?? "unknown";
}

function talentLine(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  talentId: number,
  rank: number,
): string {
  const entry = catalog?.talent(talentId);
  const name =
    entry?.ranks[0] === undefined
      ? `talent ${talentId}`
      : (ctx.handle.spellDefinition(entry.ranks[0])?.name ??
        `talent ${talentId}`);
  const ranksText = entry === undefined ? "" : ` ${rank}/${entry.ranks.length}`;
  const tab = entry === undefined ? undefined : catalog?.tab(entry.tab)?.name;
  const tabText = tab === undefined ? "" : ` (${tab})`;
  return `${name} rank ${rank}${ranksText}${tabText}`;
}

function learnedLines(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  state: TalentsSnapshot,
): string[] {
  const active = state.player?.specs[state.player.activeSpec];
  const sorted = (active?.talents ?? []).toSorted(
    (a, b) => a.talentId - b.talentId,
  );
  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  for (const talent of sorted) {
    const entry = catalog?.talent(talent.talentId);
    const tab = entry === undefined ? undefined : catalog?.tab(entry.tab)?.name;
    const line = talentLine(ctx, catalog, talent.talentId, talent.rank + 1);
    const key = tab ?? "";
    if (groups[key] === undefined) {
      groups[key] = [];
      order.push(key);
    }
    groups[key]?.push(line);
  }
  return order.map((key) =>
    key === ""
      ? (groups[key] ?? []).join("; ")
      : `${key}: ${(groups[key] ?? []).join("; ")}`,
  );
}

function slotText(
  index: number,
  unlocked: boolean | undefined,
  kind: string,
  glyph: string,
): string {
  const lock = unlocked === false ? "locked" : "open";
  return `slot ${index + 1} (${kind}, ${lock}): ${glyph}`;
}

function glyphText(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  glyphId: number,
): string {
  const spellId = catalog?.glyph(glyphId)?.spellId;
  if (spellId === undefined) return `glyph ${glyphId}`;
  return spellLabel(ctx, spellId);
}

function slotKind(
  catalog: TalentsCatalog | undefined,
  typeId: number | undefined,
): string {
  if (typeId === undefined) return kindOf(undefined);
  if (catalog === undefined) return `type ${typeId}`;
  const row = catalog.slotType(typeId);
  if (row === undefined) return `type ${typeId}`;
  return kindOf(row.typeFlags);
}

function slotLines(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  state: TalentsSnapshot,
): string[] {
  return state.slots.map((slot) => {
    const glyphId = slot.glyphId;
    const glyph =
      glyphId === undefined || glyphId === 0
        ? "empty"
        : glyphText(ctx, catalog, glyphId);
    return slotText(
      slot.index,
      slot.unlocked,
      slotKind(catalog, slot.typeId),
      glyph,
    );
  });
}

export async function showTalents(
  ctx: TalentsCtx,
): Promise<ToolResult<TalentsAfter>> {
  const { handle } = ctx;
  const state = handle.talents.state();
  const catalog = asCatalog(await handle.talents.act.catalog());
  const free = freePointsOf(state);
  const heads = [
    `${free === undefined ? "?" : free} talent point${free === 1 ? "" : "s"} free`,
    `spec ${state.player ? state.player.activeSpec + 1 : "?"} of ${state.player?.specCount ?? "?"}`,
    `${heldRanks(state).size} talents learned`,
  ];
  const body = [
    ...learnedLines(ctx, catalog, state),
    ...slotLines(ctx, catalog, state),
  ];
  if (catalog === undefined) body.push(NAMES_NEED_DATA);
  const after: TalentsAfter = {
    do: "show",
    freePoints: free,
    learned: heldRanks(state).size,
  };
  return result("DONE", {
    after,
    body,
    detail: `${heads.join("; ")}.`,
  });
}
