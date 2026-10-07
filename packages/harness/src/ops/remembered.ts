import type { OpsCtx, QuestMemory } from "#harness/contract/services";
import type { NearestKind, UnitView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";
import { type Pinned, staticRole } from "#harness/ops/sightings";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { knownUnits, unitMatches, unitViews } from "#harness/ops/views";
import { nextCall } from "#harness/tools/next-call";

export type Found = { guid: bigint; unit: UnitView };
export type Sought = {
  found: Found | undefined;
  leg: LegResult | undefined;
};

export const LAST_KNOWN_WITHIN_YD = 10;
const ROLE_FINDS: readonly NearestKind[] = [
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "innkeeper",
  "spirit_healer",
  "spirit_guide",
];

export function questNpcNames(quests: QuestMemory): Set<string> {
  const names = new Set<string>();
  for (const note of quests.values())
    for (const name of [note.giver, note.ender])
      if (name) names.add(name.toLowerCase());
  return names;
}

export function pinnedBy(quests: QuestMemory): Pinned {
  return (sighting) =>
    staticRole(sighting) ||
    questNpcNames(quests).has(sighting.name.toLowerCase());
}

function sameUnit(wanted: UnitView, unit: UnitView): boolean {
  if (unit.guid === wanted.guid) return true;
  if (wanted.kind === "creature" && wanted.entry > 0)
    return unit.kind === "creature" && unit.entry === wanted.entry;
  return unit.name.toLowerCase() === wanted.name.toLowerCase();
}

export function reacquire(ops: OpsCtx, wanted: UnitView): Found | undefined {
  const [unit] = unitViews(ops)
    .filter((view) => view.alive && sameUnit(wanted, view))
    .sort(
      (a, b) =>
        (a.distance ?? Number.MAX_SAFE_INTEGER) -
        (b.distance ?? Number.MAX_SAFE_INTEGER),
    );
  return unit ? { guid: BigInt(`0x${unit.guid}`), unit } : undefined;
}

export async function seekLastKnown(
  ops: OpsCtx,
  unit: UnitView,
): Promise<Sought> {
  const { x, y, z } = unit;
  if (x === undefined || y === undefined || z === undefined)
    return { found: reacquire(ops, unit), leg: undefined };
  const leg = await travelLeg(ops, {
    goal: { kind: "point", x, y, z },
    within: LAST_KNOWN_WITHIN_YD,
  });
  return { found: reacquire(ops, unit), leg };
}

function ageText(ms: number): string {
  return ms < 60_000
    ? `${Math.round(ms / 1000)} s`
    : `${Math.round(ms / 60_000)} min`;
}

export function lastKnownLook(unit: UnitView): string {
  const find = ROLE_FINDS.find((kind) => unitMatches(unit, kind));
  if (find) return nextCall("look", { find });
  if (unit.relation === "hostile") return nextCall("look", { find: "hostile" });
  return nextCall("look", { name: unit.name, within: 100 });
}

export function notAtLastKnown(ops: OpsCtx, unit: UnitView): Refusal {
  const last = knownUnits(ops).find((view) => view.guid === unit.guid) ?? unit;
  const where =
    last.distance === undefined
      ? ""
      : `${Math.round(last.distance)} yd${last.compass ? ` ${last.compass}` : ""} of you, `;
  ops.rt.sightings.forget(BigInt(`0x${unit.guid}`));
  return new Refusal({
    detail: `${last.name} ${last.ref} is not where it was last seen (${where}${ageText(last.seenAgoMs)} ago).`,
    next: lastKnownLook(last),
    reason: "not_at_last_known",
    status: "FAILED",
  });
}
