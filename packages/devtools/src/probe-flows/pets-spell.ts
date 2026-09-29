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

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const spellArg = args["spell"];
  const autocastArg = args["autocast"];
  const swapArg = args["swap"];
  if (!(spellArg || autocastArg || swapArg))
    throw new Error(
      "pets-spell needs --arg spell=<name> [--arg target=nearest], --arg autocast=<name>:(on|off) or --arg swap=<a>,<b>.",
    );
  await handle.loadCatalogs().catch(ignoreFailure);
  if (!(await settle(() => (handle.pets.state().bar ? true : undefined)))) {
    handle.pets.act.requestPetInfo();
    if (!(await waitFor(() => handle.pets.state().bar !== undefined)))
      throw new Error("no pet bar arrived; call the pet first.");
  }
  const failures: string[] = [];
  const off = handle.pets.onEvent((event) => {
    if (event.type === "cast_failed") failures.push(event.reason);
  });
  try {
    const before = barJson(handle);
    if (spellArg) {
      const found = spellIdOf(handle, spellArg);
      if (!found) throw new Error(`the pet bar has no ${spellArg}.`);
      const target =
        args["target"] === "nearest"
          ? nearestHostile(handle, handle.pets.state().bar?.guid ?? 0n)
          : undefined;
      if (args["target"] === "nearest" && target === undefined)
        throw new Error("no hostile creature within 35 yards.");
      const beforeFails = failures.length;
      const result = handle.pets.act.petCast(
        found.id,
        target === undefined
          ? { kind: "none" }
          : { guid: target, kind: "unit" },
      );
      const failed = await waitFor(() => failures.length > beforeFails, 3000);
      return {
        after: barJson(handle),
        before,
        failed,
        refused: failures.at(-1) ?? null,
        result,
        target: hex(target),
      };
    }
    if (autocastArg) {
      const [name, mode] = autocastArg.split(":");
      if (!name || (mode !== "on" && mode !== "off"))
        throw new Error(
          `pets-spell needs autocast=<name>:(on|off), not "${autocastArg}".`,
        );
      const found = spellIdOf(handle, name);
      if (!found) throw new Error(`the pet bar has no ${name}.`);
      const bars = { shown: 0 };
      const watch = handle.pets.onEvent((event) => {
        if (event.type === "bar" && !event.cleared) bars.shown++;
      });
      try {
        const result = handle.pets.act.petAutocast(found.id, mode === "on");
        const replied = await waitFor(() => bars.shown > 0);
        return {
          after: barJson(handle),
          before,
          replied,
          result,
          was: found.autocast,
        };
      } finally {
        watch();
      }
    }
    const slots = (swapArg ?? "").split(",").map(Number);
    const a = slots[0];
    const b = slots[1];
    if (
      slots.length !== 2 ||
      a === undefined ||
      b === undefined ||
      !(a >= 0 && a < 10 && b >= 0 && b < 10)
    )
      throw new Error(
        `pets-spell needs swap=<a>,<b> in 0-9, not "${swapArg}".`,
      );
    const bars = { shown: 0 };
    const watch = handle.pets.onEvent((event) => {
      if (event.type === "bar" && !event.cleared) bars.shown++;
    });
    try {
      handle.pets.act.requestPetInfo();
      if (!(await waitFor(() => bars.shown > 0)))
        throw new Error("no fresh pet bar arrived before the swap.");
      const result = handle.pets.act.petSwapActions(a, b);
      handle.pets.act.requestPetInfo();
      const replied = await waitFor(() => bars.shown > 1);
      return { after: barJson(handle), before, replied, result };
    } finally {
      watch();
    }
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
