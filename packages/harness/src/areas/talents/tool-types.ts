import type { AreaState, UnitEntity } from "@peon/core";
import { isUnit } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export type TalentsAfter = {
  do: "show" | "learn" | "glyph" | "unglyph";
  freePoints: number | undefined;
  learned: number;
};

export type TalentsCtx = ToolCtx<TalentsAfter>;

export type TalentsCatalog = {
  talent: (
    id: number,
  ) => { ranks: number[]; tab: number; row: number } | undefined;
  tab: (id: number) => { name: string } | undefined;
  talentsForClass: (classId: number) => { id: number }[];
  glyph: (id: number) => { spellId: number; typeFlags: number } | undefined;
  slotType: (typeId: number) => { typeFlags: number } | undefined;
};

export function asCatalog(value: unknown): TalentsCatalog | undefined {
  if (value === undefined || value === null) return undefined;
  const catalog = value as Record<string, unknown>;
  if (
    typeof catalog["talent"] !== "function" ||
    typeof catalog["tab"] !== "function" ||
    typeof catalog["talentsForClass"] !== "function" ||
    typeof catalog["glyph"] !== "function" ||
    typeof catalog["slotType"] !== "function"
  )
    return undefined;
  return value as TalentsCatalog;
}

export const NAMES_NEED_DATA = "Talent names need talent data; use ids.";

export type TalentsSnapshot = AreaState<"talents">;

export function freePointsOf(state: TalentsSnapshot): number | undefined {
  return state.player?.freePoints ?? state.fields.freePoints;
}

export function heldRanks(state: TalentsSnapshot): Map<number, number> {
  const active = state.player?.specs[state.player.activeSpec];
  return new Map(
    (active?.talents ?? []).map((talent) => [talent.talentId, talent.rank + 1]),
  );
}

export function selfUnit(ctx: TalentsCtx): UnitEntity | undefined {
  const guid = ctx.handle.getControlState().selfGuid;
  if (guid === undefined) return undefined;
  const entity = ctx.handle.getEntity(guid);
  return isUnit(entity) ? entity : undefined;
}

export function spellLabel(ctx: TalentsCtx, spellId: number): string {
  return ctx.handle.spellDefinition(spellId)?.name || `spell ${spellId}`;
}

export function talentName(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  talentId: number,
): string {
  const first = catalog?.talent(talentId)?.ranks[0];
  const name =
    first === undefined ? undefined : ctx.handle.spellDefinition(first)?.name;
  return name || `talent ${talentId}`;
}

export function tabName(
  catalog: TalentsCatalog | undefined,
  talentId: number,
): string | undefined {
  const tab = catalog?.talent(talentId)?.tab;
  return tab === undefined ? undefined : catalog?.tab(tab)?.name;
}
