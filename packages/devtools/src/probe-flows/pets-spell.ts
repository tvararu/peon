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

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

function nearestHostile(handle: WorldHandle, pet: bigint): bigint | undefined {
  return others(handle).find(
    (r) =>
      entityType(r) === "unit" &&
      r.entity.guid !== pet &&
      !r.tappedByOther &&
      r.distance !== null &&
      r.distance <= SIGHT_YARDS &&
      r.attackable &&
      r.relation === "hostile",
  )?.entity.guid;
}

function spellIdOf(
  handle: WorldHandle,
  name: string,
): { id: number; autocast: string } | undefined {
  const bar = handle.pets.state().bar;
  const row = bar?.spells.find(
    (entry) =>
      handle.spellDefinition(entry.spell)?.name.toLowerCase() ===
      name.toLowerCase(),
  );
  if (!row) return undefined;
  return { autocast: row.autocast, id: row.spell };
}

function barJson(handle: WorldHandle): Json {
  const { bar, cooldowns, lastRefusal } = handle.pets.state();
  return {
    cooldowns: cooldowns.map(({ infinite, spell }) => ({ infinite, spell })),
    refusal: lastRefusal ? lastRefusal.reason : null,
    slots: bar ? bar.slots.map(({ action, type }) => ({ action, type })) : null,
    spells: bar
      ? bar.spells.map(({ autocast, spell }) => ({
          autocast,
          id: spell,
          name: handle.spellDefinition(spell)?.name ?? null,
        }))
      : null,
  };
}

type Mode =
  | { kind: "spell" }
  | { kind: "autocast"; name: string; on: boolean }
  | { kind: "swap"; a: number; b: number };

function modeOf(args: Record<string, string>): Mode {
  const spell = args["spell"];
  const autocast = args["autocast"];
  const swap = args["swap"];
  if (!(spell || autocast || swap))
    throw new Error(
      "pets-spell needs --arg spell=<name> [--arg target=nearest], --arg autocast=<name>:(on|off) or --arg swap=<a>,<b>.",
    );
  if (spell) return { kind: "spell" };
  if (autocast) {
    const [name, mode] = autocast.split(":");
    if (!name || (mode !== "on" && mode !== "off"))
      throw new Error(
        `pets-spell needs autocast=<name>:(on|off), not "${autocast}".`,
      );
    return { kind: "autocast", name, on: mode === "on" };
  }
  const slots = (swap ?? "").split(",").map(Number);
  const [a, b] = slots;
  if (
    slots.length !== 2 ||
    a === undefined ||
    b === undefined ||
    !(a >= 0 && a < 10 && b >= 0 && b < 10)
  )
    throw new Error(`pets-spell needs swap=<a>,<b> in 0-9, not "${swap}".`);
  return { a, b, kind: "swap" };
}

async function ensureBar({ handle, settle }: FlowContext): Promise<void> {
  if (await settle(() => (handle.pets.state().bar ? true : undefined))) return;
  handle.pets.act.requestPetInfo();
  if (!(await waitFor(() => handle.pets.state().bar !== undefined)))
    throw new Error("no pet bar arrived; call the pet first.");
}

function watchBars(handle: WorldHandle): [{ shown: number }, () => void] {
  const bars = { shown: 0 };
  const stop = handle.pets.onEvent((event) => {
    if (event.type === "bar" && !event.cleared) bars.shown++;
  });
  return [bars, stop];
}

async function castSpell(
  { args, handle }: FlowContext,
  before: Json,
  failures: string[],
): Promise<Json> {
  const name = args["spell"] ?? "";
  const found = spellIdOf(handle, name);
  if (!found) throw new Error(`the pet bar has no ${name}.`);
  const wantNearest = args["target"] === "nearest";
  const target = wantNearest
    ? nearestHostile(handle, handle.pets.state().bar?.guid ?? 0n)
    : undefined;
  if (wantNearest && target === undefined)
    throw new Error("no hostile creature within 35 yards.");
  const seen = failures.length;
  const result = handle.pets.act.petCast(
    found.id,
    target === undefined ? { kind: "none" } : { guid: target, kind: "unit" },
  );
  const failed = await waitFor(() => failures.length > seen, 3000);
  return {
    after: barJson(handle),
    before,
    failed,
    refused: failures.at(-1) ?? null,
    result,
    target: hex(target),
  };
}

async function toggleAutocast(
  handle: WorldHandle,
  before: Json,
  name: string,
  on: boolean,
): Promise<Json> {
  const found = spellIdOf(handle, name);
  if (!found) throw new Error(`the pet bar has no ${name}.`);
  const [bars, stop] = watchBars(handle);
  try {
    const result = handle.pets.act.petAutocast(found.id, on);
    const replied = await waitFor(() => bars.shown > 0);
    return {
      after: barJson(handle),
      before,
      replied,
      result,
      was: found.autocast,
    };
  } finally {
    stop();
  }
}

async function swapSlots(
  handle: WorldHandle,
  before: Json,
  a: number,
  b: number,
): Promise<Json> {
  const [bars, stop] = watchBars(handle);
  try {
    handle.pets.act.requestPetInfo();
    if (!(await waitFor(() => bars.shown > 0)))
      throw new Error("no fresh pet bar arrived before the swap.");
    const result = handle.pets.act.petSwapActions(a, b);
    handle.pets.act.requestPetInfo();
    const replied = await waitFor(() => bars.shown > 1);
    return { after: barJson(handle), before, replied, result };
  } finally {
    stop();
  }
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle } = ctx;
  const mode = modeOf(ctx.args);
  await handle.loadCatalogs().catch(ignoreFailure);
  await ensureBar(ctx);
  const failures: string[] = [];
  const off = handle.pets.onEvent((event) => {
    if (event.type === "cast_failed") failures.push(event.reason);
  });
  try {
    const before = barJson(handle);
    if (mode.kind === "spell") return await castSpell(ctx, before, failures);
    if (mode.kind === "autocast")
      return await toggleAutocast(handle, before, mode.name, mode.on);
    return await swapSlots(handle, before, mode.a, mode.b);
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "pets-spell",
  run,
  usage:
    "--flow pets-spell --arg spell=<name> [--arg target=nearest]: cast the named pet spell (at the nearest hostile creature with target=nearest) and print the bar, the cooldowns and any cast failure. --arg autocast=<name>:(on|off): toggle autocast for the named spell. --arg swap=<a>,<b>: swap two bar slots in 0-9.",
};
