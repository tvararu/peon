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
const DEFAULT_SECONDS = 10;
const REACH_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 6;

type OpenLockQueryLike =
  | { by: "spell"; spellId: number }
  | { by: "item"; entry: number }
  | { ok: false; reason: string };

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function parseEntry(text: string | undefined): number {
  if (text === undefined || !ENTRY.test(text))
    throw new Error(`objects-open needs entry=<object entry>, not "${text}".`);
  return Number(text);
}

function parseGuid(text: string | undefined): bigint | undefined {
  if (text === undefined) return undefined;
  if (!GUID.test(text))
    throw new Error(`objects-open needs guid=<0x...>, not "${text}".`);
  return BigInt(text);
}

async function walkTo(
  handle: WorldHandle,
  entry: number,
  guid: bigint | undefined,
) {
  let distance: number | null = null;
  let traveled = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const at = others(handle).find(
      (row) =>
        row.entity.objectType === 5 &&
        (guid === undefined
          ? row.entity.entry === entry
          : row.entity.guid === guid),
    );
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

type Acts = {
  use: (guid: bigint) => unknown;
  open: (guid: bigint, spellId: number) => unknown;
  openLockSpell: (entry: number) => Promise<OpenLockQueryLike>;
};

type Found = {
  entry: number;
  guid: bigint;
  row: ReturnType<typeof others>[number];
};

async function findObject(
  handle: WorldHandle,
  settle: FlowContext["settle"],
  entry: number,
  guidArg: bigint | undefined,
): Promise<Found> {
  const found = await settle(() =>
    others(handle).find(
      (candidate) =>
        candidate.entity.objectType === 5 &&
        (guidArg === undefined
          ? candidate.entity.entry === entry
          : candidate.entity.guid === guidArg),
    ),
  );
  if (!found) throw new Error("objects-open found no matching object.");
  return { entry: found.entity.entry, guid: found.entity.guid, row: found };
}

function watch(handle: WorldHandle, used: Json[], loot: Json[]) {
  const offObjects = handle.objects.onEvent((event) => {
    if (event.type === "used") {
      const spellId =
        "spellId" in event && typeof event.spellId === "number"
          ? event.spellId
          : null;
      used.push({
        entry: event.entry,
        guid: hex(event.guid),
        how: event.how,
        spellId,
      });
    }
  });
  const offRewards = handle.onRewardsEvent((event) => {
    if (event.type === "loot_opened") {
      const state = handle.getRewardsState().loot;
      if (state.phase === "open")
        loot.push({ guid: hex(state.guid), items: state.items.length });
    }
  });
  return () => {
    offObjects();
    offRewards();
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const entry = parseEntry(args["entry"]);
  const guidArg = parseGuid(args["guid"]);
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  const found = await findObject(handle, settle, entry, guidArg);
  const { distance, traveled } = await walkTo(handle, entry, guidArg);
  const acts = handle.objects.act as unknown as Acts;
  const choice = await acts.openLockSpell(found.entry);
  const used: Json[] = [];
  const loot: Json[] = [];
  const stop = watch(handle, used, loot);
  const guid = found.guid;
  const useOutcome = acts.use(guid);
  let openOutcome: unknown = null;
  if (
    choice &&
    typeof choice === "object" &&
    "by" in choice &&
    choice.by === "spell"
  )
    openOutcome = acts.open(guid, choice.spellId);
  await Bun.sleep(seconds * 1000);
  stop();
  const rewards = handle.getRewardsState().loot;
  return {
    choice: JSON.parse(JSON.stringify(choice)) as Json,
    distance,
    guid: hex(guid),
    loot,
    object: summary(found.row),
    open: JSON.parse(
      JSON.stringify(openOutcome, (_, v) =>
        typeof v === "bigint" ? hex(v) : v,
      ),
    ) as Json,
    rewards:
      rewards.phase === "open"
        ? {
            guid: hex(rewards.guid),
            items: rewards.items.map((item) => ({
              entry: item.itemId,
              slot: item.slot,
            })),
          }
        : { phase: rewards.phase },
    traveled: Math.round(traveled * 10) / 10,
    use: JSON.parse(
      JSON.stringify(useOutcome, (_, v) =>
        typeof v === "bigint" ? hex(v) : v,
      ),
    ) as Json,
    used,
  };
}

export const flow: ProbeFlow = {
  name: "objects-open",
  run,
  usage:
    "--flow objects-open --arg entry=<object entry> [--arg guid=<0x...> --arg seconds=<s>]: walk to the object, resolve its open-lock spell, send the use then the open cast, and report the loot window.",
};
