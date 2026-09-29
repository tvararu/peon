import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Aura = ReturnType<WorldHandle["getCombatState"]>["auras"][number];

const SLOW_FALL = 130;
const APPLY_WAIT_MS = 5000;
const DEFAULT_CAP_S = 60;
const MARGIN_MS = 3000;
const CANCEL_WAIT_MS = 5000;
const POLL_MS = 100;

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? SLOW_FALL);
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `selfstate-slowfall needs spell=<id>, not "${args["spell"]}".`,
    );
  return spell;
}

function capOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["cap"] ?? DEFAULT_CAP_S);
  if (!(seconds > 0))
    throw new Error(`selfstate-slowfall needs cap > 0, not "${seconds}".`);
  return seconds * 1000;
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

async function run({ handle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const cap = capOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const started = Date.now();
  if (!auraOf(handle, spell)) handle.cast(spell, 0n);
  const applied = await until(
    () => auraOf(handle, spell) !== undefined,
    APPLY_WAIT_MS,
  );
  const aura = auraOf(handle, spell);
  if (!(applied && aura)) return { spell, stop: "no_aura" };
  const duration = aura.duration ?? null;
  const wait = Math.min(cap, (duration ?? cap) + MARGIN_MS);
  const expired = await until(() => auraOf(handle, spell) === undefined, wait);
  const heldMs = Date.now() - started;
  if (expired) return { duration, heldMs, spell, stop: "aura_expired" };
  const cancel = handle.spells.act.cancelAura(spell);
  if (!cancel.ok)
    return { cancel: cancel.reason, duration, heldMs, spell, stop: "refused" };
  const removed = await until(
    () => auraOf(handle, spell) === undefined,
    CANCEL_WAIT_MS,
  );
  return {
    cancel: "ok",
    duration,
    heldMs,
    spell,
    stop: removed ? "aura_cancelled" : "aura_kept",
  };
}

export const flow: ProbeFlow = {
  name: "selfstate-slowfall",
  run,
  usage:
    "--flow selfstate-slowfall [--arg spell=<id>] [--arg cap=<s>]: cast Slow Fall (spell 130 unless spell is given) on the character, wait for its aura, then wait for the aura to end (its duration plus 3 s, at most <s> seconds, default 60) and cancel it with CMSG_CANCEL_AURA if it is still on.",
};
