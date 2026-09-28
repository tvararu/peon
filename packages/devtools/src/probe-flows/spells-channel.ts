import type { AreaEventOf, WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Mode = "finish" | "cancel" | "hit";
type SpellsEvent = AreaEventOf<"spells">;

const MODES = new Set<string>(["finish", "cancel", "hit"]);
const SIGHT_YARDS = 30;
const CAST_YARDS = 28;
const MELEE_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const PET_HIGH = 0xf1_40n;
const PET_SPAN = 0x1_00_00_00_00_00_00n;
const START_WAIT_MS = 5000;
const CANCEL_AFTER_MS = 1000;
const END_GRACE_MS = 4000;
const ENDLESS_WAIT_MS = 30_000;
const SWING_WAIT_MS = 3000;
const POLL_MS = 100;

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(`spells-channel needs spell=<id>, not "${args["spell"]}".`);
  return spell;
}

function modeOf(args: Readonly<Record<string, string>>): Mode {
  const mode = args["mode"] ?? "finish";
  if (!MODES.has(mode))
    throw new Error(
      `spells-channel needs mode=finish|cancel|hit, not "${mode}".`,
    );
  return mode as Mode;
}

function hostile(handle: WorldHandle): Row | undefined {
  return others(handle).find(
    (row) =>
      entityType(row) === "unit" &&
      row.entity.guid / PET_SPAN !== PET_HIGH &&
      !row.tappedByOther &&
      row.distance !== null &&
      row.distance <= SIGHT_YARDS &&
      row.attackable &&
      row.relation === "hostile" &&
      "health" in row.entity &&
      row.entity.health > 0,
  );
}

function rowOf(handle: WorldHandle, guid: bigint): Row | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === guid);
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

async function waitFor(
  seen: readonly SpellsEvent[],
  type: SpellsEvent["type"],
  ms: number,
): Promise<SpellsEvent | undefined> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = seen.find((event) => event.type === type);
    if (found) return found;
    await Bun.sleep(POLL_MS);
  }
  return seen.find((event) => event.type === type);
}

function eventJson(event: SpellsEvent): Json {
  if (event.type === "channel_end")
    return { reason: event.reason, spellId: event.spellId, type: event.type };
  if (event.type === "spell_visual")
    return {
      guid: hex(event.guid),
      impact: event.impact,
      kit: event.kit,
      type: event.type,
    };
  return {
    durationMs: event.durationMs ?? null,
    spellId: event.spellId,
    target: hex(event.target),
    type: event.type,
  };
}

function watchRemaining(handle: WorldHandle): {
  samples: number[];
  stop: () => void;
} {
  const samples: number[] = [];
  const timer = setInterval(() => {
    const remaining = handle.spells.state().channel?.remainingMs;
    if (remaining !== undefined && samples.at(-1) !== remaining)
      samples.push(remaining);
  }, POLL_MS);
  return { samples, stop: () => clearInterval(timer) };
}

async function prepare(handle: WorldHandle, mode: Mode, target: bigint) {
  handle.selectTarget(target);
  if (mode !== "hit") {
    await closeIn(handle, target, CAST_YARDS);
    handle.faceGuid(target);
    return;
  }
  await closeIn(handle, target, MELEE_YARDS);
  handle.faceGuid(target);
  handle.attack(target);
  await Bun.sleep(SWING_WAIT_MS);
  handle.faceGuid(target);
}

async function channel(
  handle: WorldHandle,
  mode: Mode,
  spell: number,
  target: bigint,
): Promise<Json> {
  const seen: SpellsEvent[] = [];
  const off = handle.spells.onEvent((event) => seen.push(event));
  const remaining = watchRemaining(handle);
  try {
    handle.cast(spell, target);
    const start = await waitFor(seen, "channel_start", START_WAIT_MS);
    if (start?.type !== "channel_start")
      return { events: seen.map(eventJson), stop: "no_channel_start" };
    if (mode === "cancel") {
      await Bun.sleep(CANCEL_AFTER_MS);
      const cancel = handle.spells.act.cancelChannel();
      const end = await waitFor(seen, "channel_end", END_GRACE_MS);
      return {
        cancel: cancel.ok ? "ok" : cancel.reason,
        events: seen.map(eventJson),
        remaining: remaining.samples,
        stop: end ? "channel_end" : "no_channel_end",
      };
    }
    const wait =
      start.durationMs === undefined
        ? ENDLESS_WAIT_MS
        : start.durationMs + END_GRACE_MS;
    const end = await waitFor(seen, "channel_end", wait);
    return {
      events: seen.map(eventJson),
      remaining: remaining.samples,
      stop: end ? "channel_end" : "no_channel_end",
    };
  } finally {
    remaining.stop();
    off();
  }
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const mode = modeOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const found = (await settle(() => hostile(handle))) ?? hostile(handle);
  if (!found)
    throw new Error(`no living hostile creature within ${SIGHT_YARDS} yards.`);
  const target = found.entity.guid;
  await prepare(handle, mode, target);
  const result = await channel(handle, mode, spell, target);
  if (mode === "hit") handle.halt();
  return { mode, result, spell, target: summary(found) };
}

export const flow: ProbeFlow = {
  name: "spells-channel",
  run,
  usage:
    "--flow spells-channel --arg spell=<id> --arg mode=<finish, cancel or hit>: target the nearest living hostile creature within 30 yards, cast the channelled spell at it, then wait for the channel to end (finish), cancel it after 1 s (cancel), or melee the creature first so its hits push the channel back (hit).",
};
