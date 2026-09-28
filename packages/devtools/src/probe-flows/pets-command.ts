import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const WAIT_MS = 10_000;
const POLL_MS = 100;
const SIGHT_YARDS = 35;
const NEAR_YARDS = 25;
const STEP_YARDS = 20;
const MAX_STEPS = 8;
const STANCES = ["passive", "defensive", "aggressive"] as const;
const ORDERS = ["stay", "follow"] as const;
const DOS = [...ORDERS, ...STANCES, "attack", "stop"] as const;

type Do = (typeof DOS)[number];
type Stance = (typeof STANCES)[number];
type Order = (typeof ORDERS)[number];

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

function dosOf(args: Readonly<Record<string, string>>): Do[] {
  return (args["do"] ?? "").split(",").map((value) => {
    const found = DOS.find((d) => d === value);
    if (!found)
      throw new Error(
        `pets-command needs do=<${DOS.join("|")}>[,...], not "${value}".`,
      );
    return found;
  });
}

function barJson(handle: WorldHandle): Json {
  const { bar } = handle.pets.state();
  return bar
    ? { command: bar.command, guid: hex(bar.guid), react: bar.react }
    : null;
}

function petTarget(handle: WorldHandle, pet: bigint): bigint | undefined {
  return handle.queryNearby().find((row) => row.entity.guid === pet)?.targetOf;
}

function nearestHostile(
  handle: WorldHandle,
  pet: bigint,
  yards: number,
): bigint | undefined {
  return others(handle).find(
    (r) =>
      entityType(r) === "unit" &&
      r.entity.guid !== pet &&
      !r.tappedByOther &&
      r.distance !== null &&
      r.distance <= yards &&
      r.attackable &&
      r.relation === "hostile",
  )?.entity.guid;
}

async function closeIn(handle: WorldHandle, target: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = handle.queryNearby().find((r) => r.entity.guid === target);
    if (!row?.position || row.distance === null || row.distance <= NEAR_YARDS)
      return;
    const yards = Math.min(STEP_YARDS, row.distance - NEAR_YARDS + 1);
    const walked = await handle.walkTowardPoint(row.position, yards);
    if (walked.traveled === 0) return;
  }
}

async function attack(handle: WorldHandle, pet: bigint, yards: number) {
  await waitFor(() => nearestHostile(handle, pet, yards) !== undefined);
  const target = nearestHostile(handle, pet, yards);
  if (target === undefined)
    throw new Error(`no hostile creature within ${yards} yards.`);
  await closeIn(handle, target);
  handle.petAttack(pet, target);
  const engaged = await waitFor(() => petTarget(handle, pet) === target);
  return { engaged, target };
}

type Session = {
  handle: WorldHandle;
  pet: bigint;
  yards: number;
  bars: () => number;
};

async function order(
  { handle, pet, yards, bars }: Session,
  what: Do,
): Promise<Record<string, Json>> {
  if (what === "attack") {
    const { engaged, target } = await attack(handle, pet, yards);
    return { engaged, target: hex(target) };
  }
  if (what === "stop") {
    const { engaged, target } = await attack(handle, pet, yards);
    const before = hex(petTarget(handle, pet));
    const result = handle.pets.act.petStopAttack();
    const cleared = await waitFor(() => petTarget(handle, pet) === undefined);
    return {
      cleared,
      engaged,
      result,
      target: hex(target),
      targetAfter: hex(petTarget(handle, pet)),
      targetBefore: before,
    };
  }
  const seen = bars();
  const result = STANCES.includes(what as Stance)
    ? handle.pets.act.petStance(what as Stance)
    : handle.pets.act.petCommand(what as Order);
  const replied = await waitFor(() => bars() > seen);
  return { replied, result };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const dos = dosOf(args);
  const yards = Number(args["yards"] ?? SIGHT_YARDS);
  if (!(yards > 0))
    throw new Error(`pets-command needs yards > 0, not "${args["yards"]}".`);
  let shown = 0;
  const feedback: string[] = [];
  const off = handle.pets.onEvent((event) => {
    if (event.type === "bar" && !event.cleared) shown++;
    if (event.type === "feedback") feedback.push(event.reason);
  });
  try {
    await handle.loadCatalogs().catch(ignoreFailure);
    const ready = () => (handle.pets.state().bar ? true : undefined);
    if (!(await settle(ready))) {
      handle.pets.act.requestPetInfo();
      if (!(await waitFor(() => ready() === true)))
        throw new Error("no pet bar arrived; call the pet first.");
    }
    const before = barJson(handle);
    const pet = handle.pets.state().bar?.guid ?? 0n;
    const session = { bars: () => shown, handle, pet, yards };
    const steps: Json[] = [];
    for (const what of dos) {
      const out = await order(session, what);
      steps.push({ after: barJson(handle), do: what, ...out });
    }
    return { before, feedback, steps };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "pets-command",
  run,
  usage: `--flow pets-command --arg do=<${DOS.join(" | ")}>[,...] [--arg yards=<n>]: send each pet order or stance in turn and print the bar after each. attack sends the pet at the nearest hostile creature within yards (default 35), after walking within 25 yards of it; stop does that, then stops the pet and waits for its target to clear.`,
};
