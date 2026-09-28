import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Aura = ReturnType<WorldHandle["getCombatState"]>["auras"][number];

const APPLY_WAIT_MS = 5000;
const REMOVE_WAIT_MS = 5000;
const POLL_MS = 100;

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(`spells-aura needs spell=<id>, not "${args["spell"]}".`);
  return spell;
}

function auraOf(handle: WorldHandle, spell: number): Aura | undefined {
  return handle.getCombatState().auras.find((a) => a.spellId === spell);
}

async function until(test: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await Bun.sleep(POLL_MS);
  }
  return test();
}

function auraJson(aura: Aura): Json {
  return {
    duration: aura.duration ?? null,
    flags: aura.flags,
    slot: aura.slot,
    spellId: aura.spellId,
  };
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  if (!auraOf(handle, spell)) handle.cast(spell, 0n);
  const applied = await until(
    () => auraOf(handle, spell) !== undefined,
    APPLY_WAIT_MS,
  );
  const aura = auraOf(handle, spell);
  if (!(applied && aura)) return { spell, stop: "no_aura" };
  const cancel = handle.spells.act.cancelAura(spell);
  if (!cancel.ok)
    return {
      aura: auraJson(aura),
      cancel: cancel.reason,
      spell,
      stop: "refused",
    };
  const removed = await until(
    () => auraOf(handle, spell) === undefined,
    REMOVE_WAIT_MS,
  );
  return {
    aura: auraJson(aura),
    cancel: "ok",
    spell,
    stop: removed ? "aura_removed" : "aura_kept",
  };
}

export const flow: ProbeFlow = {
  name: "spells-aura",
  run,
  usage:
    "--flow spells-aura --arg spell=<id>: cast the spell on the character unless its aura is already on, wait for the aura, cancel it with CMSG_CANCEL_AURA, then wait for the aura to go.",
};
