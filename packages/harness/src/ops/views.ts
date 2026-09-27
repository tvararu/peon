import {
  CLASS_NAMES,
  type NearbyRow,
  ObjectType,
  type PlaceState,
  type WorldHandle,
} from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Sighting, ViewCtx } from "#harness/contract/services";
import type {
  Compass,
  NearestKind,
  PlaceView,
  PoseView,
  PowerKind,
  SelfView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";
import { guidHex, isUnitEntity } from "#harness/ops/refs";

const COMPASS: readonly Compass[] = [
  "N",
  "NW",
  "W",
  "SW",
  "S",
  "SE",
  "E",
  "NE",
];
const TURN = Math.PI * 2;
const OCTANT = Math.PI / 4;
const FAR = Number.MAX_SAFE_INTEGER;
const POWER_KINDS: Readonly<Record<number, PowerKind>> = {
  0: "mana",
  1: "rage",
  2: "focus",
  3: "energy",
  6: "runic_power",
};
const TENTHS: ReadonlySet<PowerKind> = new Set(["rage", "runic_power"]);
const TRAINERS: ReadonlySet<string> = new Set([
  "trainer",
  "class_trainer",
  "profession_trainer",
]);
const NEAREST_KINDS: readonly NearestKind[] = [
  "hostile",
  "attackable",
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "lootable",
  "player",
  "spirit_healer",
];
const KIND_TESTS: Readonly<Record<NearestKind, (unit: UnitView) => boolean>> = {
  attackable: (unit) => unit.attackable && unit.alive,
  hostile: (unit) => unit.relation === "hostile" && unit.alive,
  lootable: (unit) => unit.lootable,
  player: (unit) => unit.kind === "player",
  questgiver: (unit) => unit.roles.includes("questgiver"),
  repair: (unit) => unit.roles.includes("repair"),
  spirit_healer: (unit) => unit.roles.includes("spirit_healer"),
  trainer: (unit) => unit.roles.some((role) => TRAINERS.has(role)),
  vendor: (unit) => unit.roles.some((role) => role.startsWith("vendor")),
};

export function compassOf(radians: number): Compass {
  const turn = ((radians % TURN) + TURN) % TURN;
  return COMPASS[Math.round(turn / OCTANT) % COMPASS.length] ?? "N";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 100;
}

function unbuilt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (messageOf(error) === "not_implemented") return;
    throw error;
  }
}

export function unitMatches(unit: UnitView, kind: NearestKind): boolean {
  return KIND_TESTS[kind](unit);
}

export function poseView({ handle, rt }: ViewCtx): PoseView | undefined {
  const { pose, serverPose } = handle.getControlState();
  if (!pose) return;
  const now = rt.clock.now();
  return {
    ageMs: now - pose.updatedAt,
    facing: compassOf(pose.orientation),
    mapId: pose.mapId,
    serverFixAgeMs: serverPose ? now - serverPose.updatedAt : undefined,
    source: pose.source,
    x: round1(pose.x),
    y: round1(pose.y),
    z: round1(pose.z),
  };
}

export function vitalsView({ handle }: ViewCtx): VitalsView {
  const { self } = handle.getCombatState();
  const powerKind = POWER_KINDS[self.powerType ?? -1] ?? "none";
  const scale = TENTHS.has(powerKind) ? 10 : 1;
  return {
    hp: self.health ?? 0,
    maxHp: self.maxHealth ?? 0,
    maxPower: Math.round((self.maxPower ?? 0) / scale),
    power: Math.round((self.power ?? 0) / scale),
    powerKind,
  };
}

function xpPercent(handle: WorldHandle): number | undefined {
  const { nextLevelXp, xp } = handle.getExperienceState();
  return xp !== undefined && nextLevelXp
    ? Math.floor((xp / nextLevelXp) * 100)
    : undefined;
}

export function selfView(ctx: ViewCtx): SelfView {
  const { handle, rt } = ctx;
  const { selfGuid } = handle.getControlState();
  const combat = handle.getCombatState();
  const entity = handle
    .getNearbyEntities()
    .find((candidate) => candidate.guid === selfGuid);
  const unit = isUnitEntity(entity) ? entity : undefined;
  const world = rt.ready.inWorld();
  const inventory = handle.getInventoryState();
  return {
    ...vitalsView(ctx),
    className: CLASS_NAMES[unit?.class_ ?? 0] ?? world?.className ?? "unknown",
    copper: inventory.coinage,
    freeSlots: inventory.freeSlots,
    guid: guidHex(selfGuid),
    inCombat: combat.attackers.length > 0 || combat.attacking,
    level: combat.self.level ?? unit?.level ?? world?.level ?? 0,
    life: handle.getRecoveryState().life,
    name: rt.profile.character,
    pose: poseView(ctx),
    race: world?.race ?? "unknown",
    xpPct: xpPercent(handle),
  };
}

export function placeView({ handle, rt }: ViewCtx): PlaceView {
  const place: PlaceState | undefined = unbuilt(() => handle.getPlaceState());
  const ageMs = place?.at === undefined ? undefined : rt.clock.now() - place.at;
  return {
    ageMs,
    area: place?.area,
    areaId: place?.areaId,
    zone: place?.zone,
    zoneId: place?.zoneId,
  };
}

export function unitView({ handle, rt }: ViewCtx, row: NearbyRow): UnitView {
  const unit = row.entity;
  if (!isUnitEntity(unit)) throw new Error("unit_view_needs_a_unit");
  const { selfGuid } = handle.getControlState();
  const target = row.targetOf ?? unit.target;
  return {
    alive: unit.health > 0,
    attackable: row.attackable,
    attackingMe: row.attackingMe,
    compass:
      row.bearingRadians === null ? undefined : compassOf(row.bearingRadians),
    distance: row.distance === null ? undefined : round1(row.distance),
    entry: unit.entry,
    guid: guidHex(unit.guid),
    hp: unit.health,
    hpPct: percent(unit.health, unit.maxHealth),
    inView: true,
    kind: unit.objectType === ObjectType.PLAYER ? "player" : "creature",
    level: unit.level,
    lootable: row.lootable,
    maxHp: unit.maxHealth,
    name: unit.name ?? "unknown",
    ref: rt.refs.refOf(unit.guid),
    relation: row.relation,
    roles: row.roles,
    seenAgoMs: 0,
    tappedByOther: row.tappedByOther,
    targetsMe: target !== 0n && target === selfGuid,
    x: row.position?.x,
    y: row.position?.y,
    z: row.position?.z,
  };
}

export function sightingView(
  { handle, rt }: ViewCtx,
  sighting: Sighting,
): UnitView {
  const { pose } = handle.getControlState();
  const near = pose?.mapId === sighting.mapId ? pose : undefined;
  const dx = near ? sighting.x - near.x : 0;
  const dy = near ? sighting.y - near.y : 0;
  return {
    alive: sighting.alive,
    attackable: false,
    attackingMe: false,
    compass: near ? compassOf(Math.atan2(dy, dx)) : undefined,
    distance: near ? round1(Math.hypot(dx, dy)) : undefined,
    entry: sighting.entry,
    guid: guidHex(sighting.guid),
    hp: 0,
    hpPct: sighting.alive ? 100 : 0,
    inView: false,
    kind: sighting.kind,
    level: sighting.level,
    lootable: sighting.lootable,
    maxHp: 0,
    name: sighting.name,
    ref: rt.refs.refOf(sighting.guid),
    relation: sighting.relation,
    roles: sighting.roles,
    seenAgoMs: rt.clock.now() - sighting.seenAt,
    tappedByOther: false,
    targetsMe: false,
    x: sighting.x,
    y: sighting.y,
    z: sighting.z,
  };
}

export function unitViews(ctx: ViewCtx): UnitView[] {
  const rows = ctx.handle
    .queryNearby()
    .filter((row) => !row.self && isUnitEntity(row.entity));
  for (const row of rows) ctx.rt.sightings.note(row);
  return rows.map((row) => unitView(ctx, row));
}

function byDistance(a: UnitView, b: UnitView): number {
  return (a.distance ?? FAR) - (b.distance ?? FAR);
}

export function knownUnits(ctx: ViewCtx): UnitView[] {
  const inView = unitViews(ctx);
  const shown = new Set(inView.map((unit) => unit.guid));
  const away = ctx.rt.sightings
    .all()
    .filter((sighting) => !shown.has(guidHex(sighting.guid)));
  return [
    ...inView,
    ...away.map((sighting) => sightingView(ctx, sighting)),
  ].sort(byDistance);
}

export function nearestOf(
  known: readonly UnitView[],
): Partial<Record<NearestKind, UnitView>> {
  const nearest: Partial<Record<NearestKind, UnitView>> = {};
  for (const kind of NEAREST_KINDS) {
    const unit = known.find((candidate) => unitMatches(candidate, kind));
    if (unit) nearest[kind] = unit;
  }
  return nearest;
}

export function nearestByKind(
  ctx: ViewCtx,
): Partial<Record<NearestKind, UnitView>> {
  return nearestOf(knownUnits(ctx));
}
