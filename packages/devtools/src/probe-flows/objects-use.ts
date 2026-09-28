import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;
const GUID = /^0x[0-9a-fA-F]+$/;
const DEFAULT_SECONDS = 3;
const REACH_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 6;

type Target = { entry: number | undefined; guid: bigint | undefined };
type Outcome =
  | { ok: false; reason: string }
  | { ok: true; record: { entry: number; guid: bigint } };

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function find(
  handle: WorldHandle,
  entry: number | undefined,
  guid: bigint | undefined,
) {
  return others(handle).find(
    (row) =>
      row.entity.objectType === 5 &&
      (guid === undefined
        ? row.entity.entry === entry
        : row.entity.guid === guid),
  );
}

function parseEntry(text: string): number {
  if (!ENTRY.test(text))
    throw new Error(`objects-use needs entry=<object entry>, not "${text}".`);
  return Number(text);
}

function parseGuid(text: string): bigint {
  if (!GUID.test(text))
    throw new Error(`objects-use needs guid=<0x...>, not "${text}".`);
  return BigInt(text);
}

function targetOf(
  args: Readonly<Record<string, string>>,
): Target | { error: string } {
  const entryText = args["entry"];
  const guidText = args["guid"];
  if (entryText === undefined && guidText === undefined)
    return { error: "objects-use needs entry=<n> or guid=<0x...>." };
  return {
    entry: entryText === undefined ? undefined : parseEntry(entryText),
    guid: guidText === undefined ? undefined : parseGuid(guidText),
  };
}

async function walkTo(handle: WorldHandle, target: Target) {
  let distance: number | null = null;
  let traveled = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const at = find(handle, target.entry, target.guid);
    distance = at?.distance ?? null;
    if (!at?.position || distance === null || distance <= REACH_YARDS) break;
    const walked = await handle.walkTowardPoint(
      at.position,
      Math.min(STEP_YARDS, distance - REACH_YARDS + 1),
    );
    traveled += walked.traveled;
    if (walked.traveled === 0) break;
  }
  return { distance, traveled };
}

function outcomeJson(outcome: Outcome): Json {
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  return { entry: outcome.record.entry, guid: hex(outcome.record.guid) };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const target = targetOf(args);
  if ("error" in target) throw new Error(target.error);
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  const row = await settle(() => find(handle, target.entry, target.guid));
  if (!row) throw new Error("objects-use found no matching object.");
  const { distance, traveled } = await walkTo(handle, target);
  const used: Json[] = [];
  const off = handle.objects.onEvent((event) => {
    if (event.type === "used")
      used.push({ entry: event.entry, guid: hex(event.guid), how: event.how });
  });
  const sent = outcomeJson(handle.objects.act.use(row.entity.guid) as Outcome);
  await Bun.sleep(seconds * 1000);
  off();
  const pending = handle.objects.state().pendingUse;
  return {
    distance,
    guid: hex(row.entity.guid),
    object: summary(row),
    pendingUse: pending ? { ...pending, guid: hex(pending.guid) } : null,
    sent,
    traveled: Math.round(traveled * 10) / 10,
    used,
  };
}

export const flow: ProbeFlow = {
  name: "objects-use",
  run,
  usage:
    "--flow objects-use (--arg entry=<object entry> | --arg guid=<0x...>) [--arg seconds=<s>]: walk to the nearest object of that entry, use it, then report the pending use and the used events.",
};
