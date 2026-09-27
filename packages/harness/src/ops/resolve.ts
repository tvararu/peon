import type { FactionRelation } from "@tuicraft/core";
import type { ToolName } from "#harness/contract/result";
import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { knownUnits } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";

export type UnitQuery = {
  text: string;
  alive?: boolean;
  inView?: boolean;
  lootable?: boolean;
  relation?: readonly FactionRelation[];
};
export type Resolved =
  | { kind: "unit"; unit: UnitView; guid: bigint }
  | { kind: "ambiguous"; candidates: UnitView[] }
  | { kind: "not_seen"; text: string };

type Unresolved = Exclude<Resolved, { kind: "unit" }>;

const CANDIDATE_LINES = 5;

function fits(
  unit: UnitView,
  { alive, inView, lootable, relation }: UnitQuery,
): boolean {
  if (alive !== undefined && unit.alive !== alive) return false;
  if (inView !== undefined && unit.inView !== inView) return false;
  if (lootable !== undefined && unit.lootable !== lootable) return false;
  return !relation || relation.includes(unit.relation);
}

function pick(units: readonly UnitView[], text: string): Resolved {
  const unit = units.find((candidate) => candidate.alive) ?? units.at(0);
  return unit
    ? { guid: BigInt(`0x${unit.guid}`), kind: "unit", unit }
    : { kind: "not_seen", text };
}

export function resolveUnit(ctx: ViewCtx, query: UnitQuery): Resolved {
  const text = query.text.trim();
  const known = knownUnits(ctx);
  if (parseRef(text) !== undefined)
    return pick(
      known.filter((unit) => unit.ref === text),
      text,
    );
  const wanted = text.toLowerCase();
  const fitting = known.filter((unit) => fits(unit, query));
  const exact = fitting.filter((unit) => unit.name.toLowerCase() === wanted);
  if (exact.length > 0) return pick(exact, text);
  const partial = fitting.filter((unit) =>
    unit.name.toLowerCase().includes(wanted),
  );
  if (new Set(partial.map((unit) => unit.name)).size > 1)
    return { candidates: partial, kind: "ambiguous" };
  return pick(partial, text);
}

function where(unit: UnitView): string {
  if (unit.distance === undefined) return "distance unknown";
  return unit.compass
    ? `${Math.round(unit.distance)} yd ${unit.compass}`
    : `${Math.round(unit.distance)} yd`;
}

export function unitRefusal({
  param,
  resolved,
  tool,
}: {
  resolved: Unresolved;
  tool: ToolName;
  param: string;
}): Refusal {
  if (resolved.kind === "not_seen") {
    return new Refusal({
      detail: `no unit named "${resolved.text}" was seen.`,
      next: nextCall("travel", { to: "explore" }),
      reason: "not_seen",
    });
  }
  const { candidates } = resolved;
  const names = [...new Set(candidates.map((unit) => unit.name))].join(", ");
  const call = (unit: UnitView) => nextCall(tool, { [param]: unit.ref });
  const nearest = candidates.at(0);
  return new Refusal({
    body: candidates
      .slice(0, CANDIDATE_LINES)
      .map((unit) => `${unit.name} ${unit.ref}, ${where(unit)}: ${call(unit)}`),
    detail: `the name matches ${candidates.length} units (${names}).`,
    next: nearest ? call(nearest) : nextCall("look"),
    options: candidates.map((unit) => unit.ref),
    reason: "ambiguous_unit",
  });
}
