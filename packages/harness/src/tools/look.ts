import type { LookAfter, LookFilter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import type {
  NearestKind,
  NowSnapshot,
  PlaceView,
  PoseView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { compassWord, exploreSummary } from "#harness/ops/explore";
import {
  LOOK_DEFAULT_ROWS,
  LOOK_DEFAULT_YD,
  LOOK_MAX_ROWS,
} from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import {
  knownUnits,
  manaText,
  nowSnapshot,
  unitMatches,
  unitViews,
} from "#harness/ops/views";
import {
  defineGameTool,
  emptyPlace,
  emptySelf,
  result,
} from "#harness/tools/define";
import { byRelevance, MORE_NAMES, relevanceOf } from "#harness/tools/look-rank";
import { nextCall } from "#harness/tools/next-call";
import {
  type LookArgs,
  lookParams,
  prepareLookArgs,
} from "#harness/tools/params";

type Unchanged = { at: number; count: number; digest: string };
type LookFit = {
  filter: LookFilter;
  name: string | undefined;
  unit: UnitView;
  within: number;
};

const UNCHANGED_AFTER = 3;
const UNCHANGED_WINDOW_MS = 60_000;
const ALWAYS_NEAREST: readonly NearestKind[] = [
  "hostile",
  "lootable",
  "trainer",
];
const REMEMBERED_ROWS = 3;
const REMEMBERED_FILTERS: readonly LookFilter[] = [
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "spirit_healer",
];
const unchangedLooks = new WeakMap<HarnessRuntime, Unchanged>();
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

function emptyLook(): LookAfter {
  return {
    danger: { attackers: [], hpPct: 100 },
    filter: "any",
    matched: 0,
    more: [],
    name: undefined,
    nearest: {},
    place: emptyPlace(),
    remembered: [],
    rows: [],
    run: undefined,
    seen: 0,
    self: emptySelf(),
    target: undefined,
    unchanged: 0,
    within: undefined,
  };
}

function kindOf(filter: LookFilter): NearestKind | undefined {
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

function ageText(ms: number): string {
  return ms < 60_000
    ? `${Math.round(ms / 1000)} s`
    : `${Math.round(ms / 60_000)} min`;
}

function distanceText({ compass, distance }: UnitView): string {
  if (distance === undefined) return "distance unknown";
  const yards = Math.round(distance);
  return yards > 0 && compass ? `${yards} yd ${compass}` : `${yards} yd`;
}

function powerText(vitals: VitalsView): string {
  const { maxPower, power, powerKind } = vitals;
  if (powerKind === "none" || maxPower === 0) return "";
  if (powerKind === "mana") return `${manaText(vitals)}, `;
  return `${powerKind.replace("_", " ")} ${power}, `;
}

function placeText({ ageMs, area, zone }: PlaceView): string {
  const where =
    [zone, area].filter((part) => part !== undefined).join(", ") ||
    "Zone unknown";
  return ageMs === undefined
    ? `${where}.`
    : `${where} (area ${ageText(ageMs)} old).`;
}

function poseText(pose: PoseView | undefined): string {
  if (!pose) return "Position unknown.";
  const fix =
    pose.serverFixAgeMs === undefined
      ? "no server fix yet"
      : `server fix ${ageText(pose.serverFixAgeMs)} ago`;
  return `${Math.round(pose.x)}, ${Math.round(pose.y)}, facing ${pose.facing}. Pose ${pose.source}, ${fix}.`;
}

function selfLine({ place, self }: LookAfter): string {
  const combat = self.inCombat ? "in combat" : "not in combat";
  const vitals = `HP ${self.hp}/${self.maxHp}, ${powerText(self)}${self.life}, ${combat}`;
  return `${self.name} L${self.level} ${self.className}, ${vitals}. ${placeText(place)} ${poseText(self.pose)}`;
}

function statusLine({ run, target }: LookAfter): string {
  const aimed = target
    ? `${target.ref} ${target.name} ${target.hpPct}%`
    : "none";
  if (!run) return `Target: ${aimed}. Running: nothing.`;
  return `Target: ${aimed}. Running: ${run.id} ${run.label} (${ageText(run.elapsedMs)}). It is still running. End your turn to wait.`;
}

function nounOf(filter: LookFilter): string {
  return filter === "any" ? "units" : `${filter.replace("_", " ")} units`;
}

function headerLine({
  filter,
  matched,
  more,
  rows,
  within,
}: LookAfter): string {
  const range = within ?? LOOK_DEFAULT_YD;
  if (rows.length === 0) return `No ${nounOf(filter)} within ${range} yd.`;
  const order = more.length > 0 ? "most relevant first" : "nearest first";
  return `${rows.length} of ${matched} ${nounOf(filter)} within ${range} yd, ${order}:`;
}

function moreLine({ more, within }: LookAfter): string[] {
  if (more.length === 0) return [];
  const named = more
    .slice(0, MORE_NAMES)
    .map((unit) => `${unit.ref} ${unit.name} ${distanceText(unit)}`)
    .join(", ");
  return [
    `${more.length} more: ${named}. Use ${nextCall("look", { within: within ?? LOOK_DEFAULT_YD })} to list all.`,
  ];
}

function lastSeenText(unit: UnitView, then: readonly string[]): string {
  const was = then.length > 0 ? `, then ${then.join(", ")}` : "";
  return `last seen ${distanceText(unit)} ${ageText(unit.seenAgoMs)} ago${was} (not in view)`;
}

function rowLine(unit: UnitView): string {
  const volatile = [
    unit.alive ? undefined : "dead",
    unit.lootable ? "lootable" : undefined,
    unit.attackingMe ? "attacking you" : undefined,
    unit.targetsMe && !unit.attackingMe ? "targets you" : undefined,
    unit.tappedByOther ? "tapped by another player" : undefined,
  ].filter((trait) => trait !== undefined);
  const traits = [
    unit.kind === "player" ? "player" : undefined,
    unit.relation,
    unit.roles.length > 0 ? unit.roles.join(" ") : undefined,
    ...(unit.inView
      ? [...volatile, distanceText(unit)]
      : [lastSeenText(unit, volatile)]),
  ];
  return `- ${unit.ref} ${unit.name} L${unit.level} ${traits.filter((trait) => trait !== undefined).join(", ")}`;
}

function nearestText(kind: NearestKind, unit: UnitView | undefined): string {
  const label = `Nearest ${kind.replace("_", " ")}:`;
  if (!unit) return `${label} ${kind === "lootable" ? "none" : "none seen"}.`;
  const life = unit.alive ? "alive" : "dead";
  if (!unit.inView)
    return `${label} ${unit.ref} ${unit.name} L${unit.level}, last seen ${distanceText(unit)} ${ageText(unit.seenAgoMs)} ago, then ${life}.`;
  return `${label} ${unit.ref} ${unit.name} L${unit.level} ${life}, ${distanceText(unit)} (seen now).`;
}

function nearestLine({ filter, nearest }: LookAfter): string {
  const own = kindOf(filter);
  const kinds =
    own && !ALWAYS_NEAREST.includes(own)
      ? [...ALWAYS_NEAREST, own]
      : ALWAYS_NEAREST;
  return kinds.map((kind) => nearestText(kind, nearest[kind])).join(" ");
}

function lookBody(after: LookAfter): string[] {
  const calm =
    after.danger.attackers.length === 0 ? ["No unit is attacking you."] : [];
  const stale =
    after.unchanged >= UNCHANGED_AFTER && !after.run
      ? [
          `Nothing changed in ${after.unchanged} looks. Act, or end your turn to wait for events.`,
        ]
      : [];
  return [
    statusLine(after),
    headerLine(after),
    ...after.rows.map(rowLine),
    ...moreLine(after),
    ...after.remembered.map(rowLine),
    nearestLine(after),
    ...calm,
    ...stale,
  ];
}

function lookDigest(rows: readonly UnitView[], snapshot: NowSnapshot): string {
  const pose = snapshot.self.pose;
  const where = pose
    ? `${Math.floor(pose.x / 2)}:${Math.floor(pose.y / 2)}`
    : "-";
  const units = rows
    .map(
      (unit) => `${unit.ref}:${unit.hpPct}:${Math.round(unit.distance ?? -1)}`,
    )
    .join(",");
  return `${snapshot.self.hp}|${where}|${units}`;
}

function countUnchanged(rt: HarnessRuntime, digest: string): number {
  const now = rt.clock.now();
  const last = unchangedLooks.get(rt);
  const next =
    last && last.digest === digest && now - last.at <= UNCHANGED_WINDOW_MS
      ? { ...last, count: last.count + 1 }
      : { at: now, count: 1, digest };
  unchangedLooks.set(rt, next);
  return next.count;
}

function rememberedRows(
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

function lookAfter(
  args: LookArgs,
  ctx: ToolCtx<LookAfter>,
  snapshot: NowSnapshot,
): LookAfter {
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
    danger: dangerView(ctx),
    filter,
    matched: matching.length,
    more: cut ? ordered.slice(LOOK_DEFAULT_ROWS) : [],
    name: args.name,
    nearest: snapshot.nearest,
    place: snapshot.place,
    remembered: rememberedRows(ctx, { filter, name: args.name }),
    rows,
    run: snapshot.run,
    seen: units.length,
    self: snapshot.self,
    target: snapshot.target,
    unchanged: countUnchanged(ctx.rt, lookDigest(rows, snapshot)),
    within: args.within,
  };
}

const KILLABLE: readonly LookFilter[] = ["hostile", "attackable"];

function exploreHint(ctx: ToolCtx<LookAfter>, filter: LookFilter): string[] {
  const summary = exploreSummary(ctx);
  const to = summary?.next ? `explore ${compassWord(summary.next)}` : "explore";
  const walk = nextCall("travel", { to });
  const hint = KILLABLE.includes(filter)
    ? `If your task needs one: ${nextCall("engage")} explores for one and fights it, or ${walk} looks first.`
    : `If your task needs one: ${walk}.`;
  if (!summary || summary.tried.length === 0) return [hint];
  return [
    `You explored ${summary.tried.join(", ")} up to ${summary.farthestYd} yd from here.`,
    hint,
  ];
}

function noneSeen(
  ctx: ToolCtx<LookAfter>,
  after: LookAfter,
): ToolResult<LookAfter> {
  const detail = `0 ${nounOf(after.filter)} seen at any distance in the last 30 min. The client sees about 100 yd around you.`;
  return result("DONE", {
    after,
    body: exploreHint(ctx, after.filter),
    detail,
  });
}

function look(args: LookArgs, ctx: ToolCtx<LookAfter>): ToolResult<LookAfter> {
  const snapshot = nowSnapshot(ctx.rt);
  if (!snapshot)
    throw new Refusal({
      detail: "the world is still loading.",
      next: "call look again in a few seconds.",
      reason: "not_ready",
    });
  const after = lookAfter(args, ctx, snapshot);
  ctx.rt.snapshots.capture("look", args.within);
  const own = kindOf(after.filter);
  if (after.matched === 0 && own && !after.nearest[own])
    return noneSeen(ctx, after);
  return result("DONE", {
    after,
    body: lookBody(after),
    detail: selfLine(after),
  });
}

export const lookTool = defineGameTool({
  fallback: emptyLook,
  kind: "read",
  maxLines: 24,
  name: "look",
  parameters: lookParams,
  prepareArguments: prepareLookArgs,
  run: (args, ctx) => Promise.resolve(look(args, ctx)),
});
