import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const MELEE_YARDS = 4;
const CAST_YARDS = 30;
const SIGHT_YARDS = 60;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const DEFAULT_SECONDS = 90;
const POLL_MS = 250;
const CAST_WAIT_MS = 3500;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Stop = "target_dead" | "self_dead" | "timeout";

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
}

function healthOf(row: Row | undefined): number {
  return row && "health" in row.entity ? row.entity.health : 0;
}

function selfHealth(handle: WorldHandle): number {
  return healthOf(handle.queryNearby().find((row) => row.self));
}

function nearestHostile(
  handle: WorldHandle,
  entry: number | undefined,
): Row | undefined {
  return others(handle).find(
    (row) =>
      (entry === undefined || row.entity.entry === entry) &&
      entityType(row) === "unit" &&
      row.attackable &&
      row.relation === "hostile" &&
      !row.tappedByOther &&
      healthOf(row) > 0 &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS,
  );
}

function spellOf(args: Readonly<Record<string, string>>): number | undefined {
  const raw = args["spell"];
  if (raw === undefined) return undefined;
  const spell = Number(raw);
  if (!(Number.isInteger(spell) && spell > 0))
    throw new Error(`combatlog-fight needs spell=<id>, not "${raw}".`);
  return spell;
}

function entryOf(args: Readonly<Record<string, string>>): number | undefined {
  const raw = args["entry"];
  if (raw === undefined) return undefined;
  const entry = Number(raw);
  if (!(Number.isInteger(entry) && entry > 0))
    throw new Error(
      `combatlog-fight needs entry=<creature entry>, not "${raw}".`,
    );
  return entry;
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`combatlog-fight needs seconds > 0, not "${seconds}".`);
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

function tryCast(handle: WorldHandle, spell: number, target: bigint): boolean {
  try {
    handle.faceGuid(target);
    handle.cast(spell, target);
    return true;
  } catch {
    return false;
  }
}

function wayOf(self: bigint | undefined, source: bigint, target: bigint) {
  if (source === self) return "out";
  return target === self ? "in" : "other";
}

function watchLog(handle: WorldHandle) {
  const counts: Record<string, number> = {};
  const self = handle.queryNearby().find((row) => row.self)?.entity.guid;
  const off = handle.combatlog.onEvent((event) => {
    if (event.type !== "entry") return;
    const key = `${event.kind} ${wayOf(self, event.source, event.target)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return { counts, off };
}

async function fight(
  handle: WorldHandle,
  target: bigint,
  seconds: number,
): Promise<Stop> {
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    if (selfHealth(handle) === 0) return "self_dead";
    const row = rowOf(handle, target);
    if (healthOf(row) === 0) return "target_dead";
    if (row && row.distance !== null && row.distance > MELEE_YARDS + 1) {
      await closeIn(handle, target, MELEE_YARDS);
      handle.faceGuid(target);
    }
    await Bun.sleep(POLL_MS);
  }
  return "timeout";
}

function killsOf(handle: WorldHandle): Json {
  return handle.combatlog.state().kills.map((kill) => ({
    bySelf: kill.bySelf,
    killer: `0x${kill.killer.toString(16)}`,
    killerKind: kill.killerKind,
    ourTarget: kill.ourTarget,
    victim: `0x${kill.victim.toString(16)}`,
  }));
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const seconds = secondsOf(args);
  const entry = entryOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = await settle(() => nearestHostile(handle, entry));
  if (!found)
    throw new Error(`no hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  const watch = watchLog(handle);
  try {
    handle.selectTarget(target);
    if (spell !== undefined) {
      await closeIn(handle, target, CAST_YARDS);
      if (tryCast(handle, spell, target)) await Bun.sleep(CAST_WAIT_MS);
    }
    handle.attack(target);
    await closeIn(handle, target, MELEE_YARDS);
    const stop = await fight(handle, target, seconds);
    return {
      entries: watch.counts,
      spell: spell ?? null,
      state: {
        dropped: handle.combatlog.state().dropped,
        entries: handle.combatlog.state().entries.length,
        kills: killsOf(handle),
      },
      stop,
      target: summary(found),
    };
  } finally {
    watch.off();
  }
}

export const flow: ProbeFlow = {
  name: "combatlog-fight",
  run,
  usage:
    "--flow combatlog-fight [--arg spell=<id>] [--arg entry=<creature entry>] [--arg seconds=<n>]: pick the nearest living hostile creature within 60 yards (only of that creature entry when given), cast the spell at it once when given and wait 3.5 s for the cast, then attack it in melee, then wait for its death, the character's death or the time limit (90 s by default).",
};
