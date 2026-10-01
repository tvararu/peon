import type { AreaEvent, SpellDefinition } from "@peon/core";
import { knownSpell, type SpellRef } from "#harness/areas/spells/book";
import type {
  SpellAfter,
  SpellArgs,
  SpellCtx,
} from "#harness/areas/spells/tool";
import { castFlow } from "#harness/areas/spells/tool-cast";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const APPLY_AURA_EFFECT = 6;
const MOUNTED_AURA = 78;
const MOUNTED_SPEED_AURA = 32;
const FLIGHT_SPEED_AURA = 207;
const MOUNTED_WITHIN_MS = 2000;

const REFUSAL_TEXT: Record<string, string> = {
  already_mounted: "you are already mounted; dismount first.",
  in_combat: "you cannot mount while in combat.",
  in_flight: "you cannot dismount while flying.",
  in_water: "you cannot mount there; a flying mount stays above water.",
  indoors: "you cannot mount here; mounts stay outdoors.",
  no_mount: "you know no mount spell; learn one from a riding trainer.",
  not_a_mount: "that is not a mount spell.",
  not_mounted: "you are not mounted.",
};

const FAILURE_REFUSAL: Record<string, string> = {
  affecting_combat: "in_combat",
  no_mounts_allowed: "indoors",
  only_abovewater: "in_water",
  only_outdoors: "indoors",
};

function refusalOf(reason: string, spellName?: string): Refusal {
  const where = spellName ? `${spellName}: ` : "";
  const next =
    reason === "already_mounted"
      ? nextCall("spell", { do: "dismount" })
      : nextCall("journal", { about: "spells" });
  return new Refusal({
    detail: `${where}${REFUSAL_TEXT[reason] ?? reason}.`,
    next,
    reason,
  });
}

function effectAuras(effects: SpellDefinition["effects"]): number[] {
  return effects
    .filter((effect) => effect.effect === APPLY_AURA_EFFECT)
    .map((effect) => effect.applyAura);
}

function isMountSpell(definition: SpellDefinition): boolean {
  return effectAuras(definition.effects).includes(MOUNTED_AURA);
}

function isGroundMount(definition: SpellDefinition): boolean {
  const auras = effectAuras(definition.effects);
  return auras.includes(MOUNTED_AURA) && !auras.includes(FLIGHT_SPEED_AURA);
}

function mountSpeed(definition: SpellDefinition): number {
  const points = definition.effects
    .filter(
      (effect) =>
        effect.effect === APPLY_AURA_EFFECT &&
        effect.applyAura === MOUNTED_SPEED_AURA,
    )
    .map((effect) => effect.basePoints);
  return points.length > 0 ? Math.max(...points) : 0;
}

function orderOf(learned: readonly number[], id: number): number {
  const order = learned.indexOf(id);
  return order === -1 ? learned.length : order;
}

async function groundPreference(ctx: SpellCtx): Promise<SpellRef | undefined> {
  const book = await ctx.handle.getSpellbook();
  const learned = ctx.handle.getCombatState().learned;
  const known = new Set(learned);
  const ranks = book
    .filter((spell) => isGroundMount(spell) && known.has(spell.id))
    .sort((a, b) => {
      const speed = mountSpeed(b) - mountSpeed(a);
      if (speed !== 0) return speed;
      return orderOf(learned, b.id) - orderOf(learned, a.id);
    });
  const best = ranks.at(0);
  return best && { id: best.id, name: best.name };
}

async function mountSpell(ctx: SpellCtx, text: string): Promise<SpellRef> {
  const spell = await knownSpell(ctx.handle, text);
  if (!spell)
    throw new Refusal({
      detail: `you do not know a spell "${text.trim()}".`,
      next: nextCall("journal", { about: "spells" }),
      reason: "unknown_spell",
    });
  const definition = ctx.handle.spellDefinition(spell.id);
  if (definition !== undefined && !isMountSpell(definition))
    throw refusalOf("not_a_mount", spell.name);
  return spell;
}

function mountedEvent(event: AreaEvent): boolean {
  return event.area === "selfstate" && event.event.type === "mounted";
}

type MountWatch = { done: Promise<boolean>; stop: () => void };

function watchMounted(ctx: SpellCtx): MountWatch {
  const { promise, reject, resolve } = Promise.withResolvers<boolean>();
  promise.catch(() => undefined);
  const off = ctx.handle.onAreaEvent((event) => {
    if (mountedEvent(event)) resolve(true);
  });
  const onAbort = () => reject(ctx.signal.reason);
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  return {
    done: promise,
    stop: () => {
      off();
      ctx.signal.removeEventListener("abort", onAbort);
    },
  };
}

async function chooseMount(args: SpellArgs, ctx: SpellCtx): Promise<SpellRef> {
  if ((args.spell?.trim() ?? "") !== "")
    return mountSpell(ctx, args.spell ?? "");
  const ground = await groundPreference(ctx);
  if (!ground) throw refusalOf("no_mount");
  return ground;
}

async function confirmMounted(
  ctx: SpellCtx,
  watch: MountWatch,
): Promise<boolean> {
  if (ctx.handle.selfstate.state().mounted) {
    watch.stop();
    return true;
  }
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => resolve(false), MOUNTED_WITHIN_MS);
  try {
    return await Promise.race([watch.done, promise]);
  } finally {
    clearTimeout(timer);
    watch.stop();
  }
}

export async function mountFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  if (ctx.handle.selfstate.state().mounted) throw refusalOf("already_mounted");
  const spell = await chooseMount(args, ctx);
  const watch = watchMounted(ctx);
  let cast: ToolResult<SpellAfter>;
  try {
    cast = await castFlow({ do: "cast", spell: String(spell.id) }, ctx);
  } catch (error) {
    watch.stop();
    throw error;
  }
  const after: SpellAfter = {
    do: "mount",
    slot: undefined,
    spell,
    target: undefined,
  };
  if (cast.status !== "DONE") {
    watch.stop();
    if (cast.status === "FAILED") {
      const reason = FAILURE_REFUSAL[cast.reason ?? ""];
      if (reason !== undefined) throw refusalOf(reason, spell.name);
    }
    return { ...cast, after };
  }
  if (await confirmMounted(ctx, watch))
    return result("DONE", {
      after,
      detail: `Mounted ${spell.name}.`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `${spell.name} was cast but no mounted state followed within 2 s.`,
    next: nextCall("journal", { about: "log" }),
    reason: "no_reply",
  });
}

export function routeMount(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  return args.do === "dismount" ? dismountFlow(ctx) : mountFlow(args, ctx);
}

export async function dismountFlow(
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const { handle, signal } = ctx;
  const after: SpellAfter = {
    do: "dismount",
    slot: undefined,
    spell: undefined,
    target: undefined,
  };
  const { promise, reject } = Promise.withResolvers<never>();
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const outcome = await Promise.race([
      handle.selfstate.act.dismount(),
      promise,
    ]);
    if (outcome.status === "ok")
      return result("DONE", { after, detail: "Dismounted." });
    if (outcome.status === "refused") throw refusalOf(outcome.reason);
    return result("UNCONFIRMED", {
      after,
      detail: "Dismount was sent but the server did not answer within 2 s.",
      next: nextCall("journal", { about: "log" }),
      reason: "no_reply",
    });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
