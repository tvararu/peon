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

const SIGHT_YARDS = 40;
const DEFAULT_SECONDS = 20;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `unitmotion-toggle needs spell=<id>, not "${args["spell"]}".`,
    );
  return spell;
}

function secondsOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  if (!(seconds > 0))
    throw new Error(`unitmotion-toggle needs seconds > 0, not "${seconds}".`);
  return seconds;
}

function targetOf(handle: WorldHandle, want: string): Row | undefined {
  return others(handle).find((row) => {
    if (entityType(row) !== "unit") return false;
    if (row.distance === null || row.distance > SIGHT_YARDS) return false;
    if (want !== "nearest") return row.entity.guid === BigInt(want);
    return row.relation === "friendly" || row.relation === "neutral";
  });
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const seconds = secondsOf(args);
  const want = args["target"] ?? "nearest";
  await handle.loadCatalogs().catch(ignoreFailure);
  const found =
    (await settle(() => targetOf(handle, want))) ?? targetOf(handle, want);
  if (!found)
    throw new Error(
      `no unit to target within ${SIGHT_YARDS} yards for "${want}".`,
    );
  const target = found.entity.guid;
  const flags: Json[] = [];
  const off = handle.unitmotion.onEvent((event) => {
    if (event.guid === target && event.type === "flag")
      flags.push({ flag: event.flag, flags: event.flags, on: event.on });
  });
  try {
    handle.selectTarget(target);
    handle.cast(spell, target);
    await Bun.sleep(seconds * 1000);
    return { flags, spell, target: summary(found) };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "unitmotion-toggle",
  run,
  usage:
    "--flow unitmotion-toggle --arg spell=<id> [--arg target=<guid|nearest>] [--arg seconds=<n>]: target a unit (a decimal or 0x guid, or the nearest friendly or neutral unit within 40 yards), cast the spell at it without moving, wait 20 s (or seconds), and list the flag changes the unit showed.",
};
