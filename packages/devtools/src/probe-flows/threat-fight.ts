import { joinGuid, UNIT_FIELDS, type WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const AUTO_SHOT = 75;
const SHOT_YARDS = 30;
const MELEE_YARDS = 4;
const SIGHT_YARDS = 35;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const MAX_PULL = 5;
const PET_HIGH = 0xf1_40n;
const PET_SPAN = 0x1_00_00_00_00_00_00n;
const DEFAULT_SECONDS = 180;
const POLL_MS = 250;
const MELEE_AFTER_MS = 8000;
const OPEN_MS = 3000;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Stop = "targets_dead" | "self_dead" | "timeout";

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function rowOf(handle: WorldHandle, guid: bigint | undefined): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function healthOf(row: Row | undefined): number | undefined {
  return row && "health" in row.entity ? row.entity.health : undefined;
}

function alive(handle: WorldHandle, guid: bigint | undefined): boolean {
  return (healthOf(rowOf(handle, guid)) ?? 0) > 0;
}

function selfRow(handle: WorldHandle): Row | undefined {
  return handle.queryNearby().find((row) => row.self);
}

function petOf(handle: WorldHandle): bigint | undefined {
  const fields = selfRow(handle)?.entity.rawFields;
  const low = fields?.get(UNIT_FIELDS.SUMMON.offset) ?? 0;
  const high = fields?.get(UNIT_FIELDS.SUMMON.offset + 1) ?? 0;
  const pet = joinGuid(low, high);
  return pet === 0n ? undefined : pet;
}

function targetsOf(handle: WorldHandle, pull: number): Row[] {
  return others(handle)
    .filter(
      (row) =>
        entityType(row) === "unit" &&
        row.entity.guid / PET_SPAN !== PET_HIGH &&
        !row.tappedByOther &&
        row.distance !== null &&
        row.distance <= SIGHT_YARDS &&
        row.attackable &&
        row.relation === "hostile",
    )
    .slice(0, pull);
}

function pullOf(args: Readonly<Record<string, string>>): number {
  const pull = Number(args["pull"] ?? "1");
  if (!Number.isInteger(pull) || pull < 1 || pull > MAX_PULL)
    throw new Error(`threat-fight needs pull=1..${MAX_PULL}, not "${pull}".`);
  return pull;
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`threat-fight needs seconds > 0, not "${seconds}".`);
  return seconds;
}

async function closeIn(
  handle: WorldHandle,
  target: bigint,
  within: number,
): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = rowOf(handle, target);
    if (!row?.position || row.distance === null || row.distance <= within)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - within + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

function shoot(handle: WorldHandle, target: bigint): boolean {
  try {
    handle.selectTarget(target);
    handle.faceGuid(target);
    handle.cast(AUTO_SHOT, target);
    return true;
  } catch {
    return false;
  }
}

function watchThreat(handle: WorldHandle) {
  const counts: Record<string, number> = {};
  const switches: Json[] = [];
  const off = handle.threat.onEvent((event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    if (event.type !== "victim_changed") return;
    const target = rowOf(handle, event.unit)?.targetOf;
    switches.push({
      from: event.from === undefined ? null : hex(event.from),
      to: hex(event.to),
      unit: hex(event.unit),
      unitTarget: target === undefined ? null : hex(target),
    });
  });
  return { counts, off, switches };
}

type Fight = {
  handle: WorldHandle;
  targets: readonly bigint[];
  pet: bigint | undefined;
  opening: bigint[];
  started: number;
  petTarget: bigint | undefined;
  shooting: bigint | undefined;
  shotAt: number;
  melee: boolean;
};

function steerPet(f: Fight, next: bigint): void {
  if (f.pet === undefined || alive(f.handle, f.petTarget)) return;
  f.petTarget = next;
  f.handle.petAttack(f.pet, next);
}

function steerShot(f: Fight, next: bigint): void {
  const lost = !alive(f.handle, f.shooting);
  const queued =
    lost || Date.now() - f.shotAt >= OPEN_MS ? f.opening.shift() : undefined;
  if (queued === undefined && !lost) return;
  const aim = queued !== undefined && alive(f.handle, queued) ? queued : next;
  f.shooting = aim;
  f.shotAt = Date.now();
  shoot(f.handle, aim);
}

async function steerMelee(f: Fight, next: bigint): Promise<void> {
  if (f.melee || Date.now() - f.started <= MELEE_AFTER_MS) return;
  f.melee = true;
  const engaged = f.handle.threat
    .state()
    .tables.some((table) => f.targets.includes(table.unit));
  if (engaged) return;
  f.handle.attack(next);
  await closeIn(f.handle, next, MELEE_YARDS);
}

async function step(f: Fight): Promise<Stop | undefined> {
  if (healthOf(selfRow(f.handle)) === 0) return "self_dead";
  const next = f.targets.find((guid) => alive(f.handle, guid));
  if (next === undefined) return "targets_dead";
  steerPet(f, next);
  steerShot(f, next);
  await steerMelee(f, next);
  return undefined;
}

async function fight(
  handle: WorldHandle,
  targets: readonly bigint[],
  pet: bigint | undefined,
  seconds: number,
): Promise<Stop> {
  const f: Fight = {
    handle,
    melee: false,
    opening:
      pet !== undefined && targets.length > 1 ? targets.slice(1) : [...targets],
    pet,
    petTarget: undefined,
    shooting: undefined,
    shotAt: 0,
    started: Date.now(),
    targets,
  };
  while (Date.now() - f.started < seconds * 1000) {
    const stop = await step(f);
    if (stop) return stop;
    await Bun.sleep(POLL_MS);
  }
  return "timeout";
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const pull = pullOf(args);
  const seconds = secondsOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const settled = await settle(() => {
    const rows = targetsOf(handle, pull);
    return rows.length >= pull ? rows : undefined;
  });
  const found = settled ?? targetsOf(handle, pull);
  const [first] = found;
  if (!first)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  await closeIn(handle, first.entity.guid, SHOT_YARDS);
  const pet = petOf(handle);
  const watch = watchThreat(handle);
  const targets = found.map((row) => row.entity.guid);
  try {
    const stop = await fight(handle, targets, pet, seconds);
    return {
      events: watch.counts,
      pet: pet === undefined ? null : hex(pet),
      stop,
      switches: watch.switches,
      tables: handle.threat.state().tables.length,
      targets: found.map(summary),
    };
  } finally {
    watch.off();
  }
}

export const flow: ProbeFlow = {
  name: "threat-fight",
  run,
  usage:
    "--flow threat-fight [--arg pull=<1-5>] [--arg seconds=<n>]: pick the nearest living hostile creatures within 35 yards, walk within 30 yards of the first, send the pet and Auto Shot at them, then wait for their death, the character's death or the time limit.",
};
