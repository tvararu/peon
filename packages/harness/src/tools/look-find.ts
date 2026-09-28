import type { LookAfter, LookFilter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import type { NearestKind, UnitView } from "#harness/contract/views";
import {
  LOOK_DEFAULT_ROWS,
  LOOK_DEFAULT_YD,
  LOOK_MAX_ROWS,
} from "#harness/ops/range";
import { knownUnits, unitMatches, unitViews } from "#harness/ops/views";
import { byRelevance, relevanceOf } from "#harness/tools/look-rank";
import type { LookArgs } from "#harness/tools/params-look";

type LookFit = {
  filter: LookFilter;
  name: string | undefined;
  unit: UnitView;
  within: number;
};

export type LookFound = Pick<
  LookAfter,
  "filter" | "matched" | "more" | "rows" | "seen"
>;

const REMEMBERED_ROWS = 3;
const REMEMBERED_FILTERS: readonly LookFilter[] = [
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "spirit_healer",
];
const LOOK_FILTERS: readonly LookFilter[] = [
  "any",
  "hostile",
  "attackable",
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "lootable",
  "player",
  "corpse",
  "spirit_healer",
];

export function kindOf(filter: LookFilter): NearestKind | undefined {
  return filter === "any" || filter === "corpse" ? undefined : filter;
}

function filterMatches(unit: UnitView, filter: LookFilter): boolean {
  if (filter === "any") return true;
  if (filter === "corpse") return !unit.alive;
  return unitMatches(unit, filter);
}

function fitsLook({ filter, name, unit, within }: LookFit): boolean {
  if (unit.distance === undefined || unit.distance > within) return false;
  if (name && !unit.name.toLowerCase().includes(name.toLowerCase()))
    return false;
  return filterMatches(unit, filter);
}

export function rememberedRows(
  ctx: ToolCtx<LookAfter>,
  { filter, name }: { filter: LookFilter; name: string | undefined },
): UnitView[] {
  const role = REMEMBERED_FILTERS.includes(filter);
  if (!(name || role)) return [];
  return knownUnits(ctx)
    .filter(
      (unit) =>
        !unit.inView &&
        fitsLook({ filter, name, unit, within: Number.MAX_SAFE_INTEGER }),
    )
    .slice(0, REMEMBERED_ROWS);
}

export function findUnits(args: LookArgs, ctx: ToolCtx<LookAfter>): LookFound {
  const filter = LOOK_FILTERS.find((known) => known === args.find) ?? "any";
  const units = unitViews(ctx);
  const within = args.within ?? LOOK_DEFAULT_YD;
  const matching = units.filter((unit) =>
    fitsLook({ filter, name: args.name, unit, within }),
  );
  const cut = args.within === undefined && matching.length > LOOK_DEFAULT_ROWS;
  const ordered = cut ? byRelevance(matching, relevanceOf(ctx)) : matching;
  const rows = ordered.slice(
    0,
    args.within === undefined ? LOOK_DEFAULT_ROWS : LOOK_MAX_ROWS,
  );
  return {
    filter,
    matched: matching.length,
    more: cut ? ordered.slice(LOOK_DEFAULT_ROWS) : [],
    rows,
    seen: units.length,
  };
}
