import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const WAIT_MS = 10_000;
const POLL_MS = 100;
const NEAR_YARDS = 5;
const STEP_YARDS = 20;
const MAX_STEPS = 10;
const DOS = ["list", "buy", "stable", "unstable", "swap", "revive"] as const;

type Do = (typeof DOS)[number];

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

function dosOf(args: Readonly<Record<string, string>>): Do[] {
  return (args["do"] ?? "list").split(",").map((value) => {
    const found = DOS.find((d) => d === value);
    if (!found)
      throw new Error(
        `pets-stable needs do=<${DOS.join("|")}>[,...], not "${value}".`,
      );
    return found;
  });
}

function npcOf(args: Readonly<Record<string, string>>): bigint | "nearest" {
  const npc = args["npc"] ?? "nearest";
  if (npc === "nearest") return "nearest";
  try {
    return BigInt(npc);
  } catch (error) {
    throw new Error(`pets-stable needs npc=<hex guid|nearest>, not "${npc}".`, {
      cause: error,
    });
  }
}

function stableMaster(handle: WorldHandle, guid: bigint): boolean {
  return others(handle).some(
    (row) =>
      row.entity.guid === guid &&
      row.roles.some((role) => role === "stable_master"),
  );
}

function nearestStableMaster(handle: WorldHandle): bigint | undefined {
  return others(handle).find((row) =>
    row.roles.some((role) => role === "stable_master"),
  )?.entity.guid;
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  for (let at = 0; at < MAX_STEPS; at++) {
    const row = handle.queryNearby().find((r) => r.entity.guid === target);
    if (!row?.position || row.distance === null || row.distance <= NEAR_YARDS)
      return;
    const yards = Math.min(STEP_YARDS, row.distance - NEAR_YARDS + 1);
    const walked = await handle.walkTowardPoint(row.position, yards);
    if (walked.traveled === 0) return;
  }
}
async function resolveNpc(
  handle: WorldHandle,
  npc: bigint | "nearest",
  settle: FlowContext["settle"],
): Promise<{ guid: bigint }> {
  if (npc !== "nearest") return { guid: npc };
  const found = await settle(() => nearestStableMaster(handle));
  const seen = found ?? nearestStableMaster(handle);
  if (seen === undefined)
    throw new Error("no stable master in range; walk to a stable master.");
  await closeIn(handle, seen);
  return { guid: nearestStableMaster(handle) ?? seen };
}

function stableJson(handle: WorldHandle): Json {
  const { lastRefusal, stable } = handle.pets.state();
  return {
    npc: hex(stable?.npc),
    pets:
      stable?.pets.map((pet) => ({
        entry: pet.entry,
        level: pet.level,
        name: pet.name,
        number: pet.number,
        state: pet.state,
      })) ?? null,
    refusal: lastRefusal ? lastRefusal.reason : null,
    slots: stable?.slots ?? null,
    stale: stable?.stale ?? null,
  };
}

type Stable = WorldHandle["pets"];

function act(
  stableApi: Stable,
  what: Do,
  npc: bigint,
  number: number,
): unknown {
  switch (what) {
    case "list":
      return stableApi.act.listStabledPets(npc);
    case "buy":
      return stableApi.act.buyStableSlot(npc);
    case "stable":
      return stableApi.act.stablePet(npc);
    case "unstable":
      return stableApi.act.unstablePet(npc, number);
    case "swap":
      return stableApi.act.swapStabledPet(npc, number);
    case "revive":
      return stableApi.act.stableRevivePet(npc);
    default:
      throw new Error(`pets-stable cannot do "${what}".`);
  }
}

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const dos = dosOf(args);
  const npc = npcOf(args);
  const number = Number(args["number"] ?? 0);
  await handle.loadCatalogs().catch(ignoreFailure);
  const { guid: master } = await resolveNpc(handle, npc, settle);
  await settle(() => (stableMaster(handle, master) ? master : undefined));
  if (!stableMaster(handle, master))
    throw new Error(`0x${master.toString(16)} has no stable_master role here.`);
  const counts = { lists: 0, refusals: 0, results: 0, unanswered: 0 };
  const stop = handle.pets.onEvent((event) => {
    if (event.type === "stable_list") counts.lists++;
    else if (event.type === "stable_result") {
      counts.results++;
      if (
        event.result === "money" ||
        event.result === "refused" ||
        event.result === "exotic"
      )
        counts.refusals++;
    } else if (event.type === "unanswered") counts.unanswered++;
  });
  try {
    const before = { ...counts };
    const outcomes: Record<string, Json> = {};
    for (const what of dos)
      outcomes[what] = act(handle.pets, what, master, number) as Json;
    const answered = await waitFor(
      () =>
        counts.lists > before.lists ||
        counts.results > before.results ||
        counts.unanswered > before.unanswered,
    );
    return {
      answered,
      counts,
      dos: [...dos],
      npc: hex(master),
      number,
      outcomes,
      stable: stableJson(handle),
    };
  } finally {
    stop();
  }
}
export const flow: ProbeFlow = {
  name: "pets-stable",
  run,
  usage: `--flow pets-stable --arg do=<${DOS.join(" | ")}> [--arg npc=<id|nearest>] [--arg number=<n>]: run stable acts and print the next stable reply.`,
};
