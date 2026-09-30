import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const CREATE_WAIT_MS = 10_000;
const DESTROY_WAIT_MS = 10_000;
const POLL_MS = 100;

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(`spells-totem needs spell=<id>, not "${args["spell"]}".`);
  return spell;
}

async function until(test: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await Bun.sleep(POLL_MS);
  }
  return test();
}

function totemsOf(handle: WorldHandle) {
  return handle.spells.state().totems;
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  handle.cast(spell, 0n);
  const created = await until(
    () => totemsOf(handle).some((totem) => totem !== undefined),
    CREATE_WAIT_MS,
  );
  const placed = totemsOf(handle).find((totem) => totem !== undefined);
  if (!(created && placed))
    return { created: false, slot: null, spell, stop: "no_totem" };
  const guid = `0x${placed.guid.toString(16)}`;
  const destroy = handle.spells.act.destroyTotem(placed.slot);
  if (!destroy.ok)
    return {
      created: true,
      destroy: destroy.reason,
      guid,
      slot: placed.slot,
      spell,
      stop: "refused",
    };
  const gone = await until(
    () => totemsOf(handle)[placed.slot] === undefined,
    DESTROY_WAIT_MS,
  );
  return {
    created: true,
    destroy: "ok",
    guid,
    slot: placed.slot,
    spell,
    stop: gone ? "totem_gone" : "totem_kept",
  };
}

export const flow: ProbeFlow = {
  name: "spells-totem",
  run,
  usage:
    "--flow spells-totem --arg spell=<id>: cast the spell, wait for SMSG_TOTEM_CREATED, destroy the totem with CMSG_TOTEM_DESTROYED, then wait for the totem's SMSG_DESTROY_OBJECT.",
};
