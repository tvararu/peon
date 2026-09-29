import {
  castReply,
  type EntityHeard,
  hearAll,
  hearSettle,
  type PetAfter,
  type PetArgs,
  type PetCtx,
  petTarget,
  refused,
  SETTLE_MS,
  stateOf,
  throwUnlessOk,
} from "#harness/areas/pets/tool-command";
import { knownSpell, type SpellRef } from "#harness/areas/spells/book";
import type { Heard } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import type { UnitView } from "#harness/contract/views";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { knownUnits } from "#harness/ops/views";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

function unitOf(ctx: PetCtx, args: PetArgs): { guid: bigint; view: UnitView } {
  const wanted = args.target?.trim() ?? "";
  if (wanted === "")
    throw new Refusal({
      detail: "name the unit to attack.",
      next: nextCall("look"),
      reason: "missing_target",
    });
  const ref = parseRef(wanted);
  const known = knownUnits(ctx);
  const found = ref
    ? known.find((unit) => unit.ref === wanted)
    : known.find((unit) => unit.name.toLowerCase() === wanted.toLowerCase());
  if (!found)
    throw new Refusal({
      detail: `no unit "${wanted}" is in view.`,
      next: nextCall("look"),
      reason: "not_seen",
    });
  if (!found.alive)
    throw new Refusal({
      detail: `${found.name} is already dead.`,
      next: nextCall("look"),
      reason: "target_dead",
    });
  return { guid: BigInt(`0x${found.guid}`), view: found };
}

export async function attackFlow(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const target = unitOf(ctx, args);
  const after: PetAfter = {
    do: "attack",
    target: target.view.ref,
    what: undefined,
  };
  const state = stateOf(ctx.handle);
  if (!state.bar) throw refused("no_pet");
  const guid = state.bar.guid;
  const heard = await settle<Heard | EntityHeard>({
    match: (event) => {
      if ("area" in event)
        return (
          event.area === "threat" &&
          event.event.type === "reaction" &&
          (event.event as { unit: bigint }).unit === guid
        );
      return petTarget(ctx.handle, guid) === target.guid;
    },
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.handle.petAttack(guid, target.guid);
      }),
    signal: ctx.signal,
    subscribe: hearAll(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard)
    return result("DONE", {
      after,
      detail: `Your pet is on ${target.view.name} (${target.view.ref}).`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `${target.view.name} did not answer: walk closer, then send the pet again.`,
    next: nextCall("travel", { to: target.view.ref }),
    reason: "no_reply",
  });
}

async function ownerSpell(
  ctx: PetCtx,
  name: "Call Pet" | "Revive Pet" | "Dismiss Pet",
): Promise<SpellRef> {
  const spell = await knownSpell(ctx.handle, name);
  if (spell) return spell;
  throw new Refusal({
    detail: `you do not know ${name}.`,
    next: nextCall("journal", { about: "spells" }),
    reason: "unknown_spell",
  });
}

const SUMMON_NAMES = {
  call: "Call Pet",
  dismiss: "Dismiss Pet",
  revive: "Revive Pet",
} as const;

function summonHeard(kind: "call" | "revive" | "dismiss", spellId: number) {
  return (event: Heard): boolean => {
    if (!("area" in event)) return castReply(event, spellId) === false;
    if (event.area !== "pets") return false;
    const inner = event.event;
    if (inner.type === "bar")
      return kind === "dismiss" ? inner.cleared : !inner.cleared;
    return inner.type === "feedback" || inner.type === "cast_failed";
  };
}

function summonDone(
  kind: "call" | "revive" | "dismiss",
  after: PetAfter,
): ToolResult<PetAfter> {
  const detail =
    kind === "dismiss" ? "Dismissed: your pet is gone." : "Your pet is out.";
  return result("DONE", { after, detail });
}

function summonHeardResult(
  kind: "call" | "revive" | "dismiss",
  spell: SpellRef,
  after: PetAfter,
  heard: Heard,
): ToolResult<PetAfter> {
  if ("area" in heard && heard.event.type === "bar")
    return summonDone(kind, after);
  return result("FAILED", {
    after,
    detail: `${spell.name} failed.`,
    reason: "cast_failed",
  });
}

async function kennelDismiss(
  ctx: PetCtx,
  after: PetAfter,
): Promise<ToolResult<PetAfter>> {
  const heard = await settle<Heard>({
    match: (event) =>
      "area" in event &&
      event.area === "pets" &&
      event.event.type === "bar" &&
      event.event.cleared,
    send: () =>
      ctx.rt.mutex.run(() => {
        const outcome = ctx.handle.pets.act.petCommand("dismiss");
        throwUnlessOk(outcome);
      }),
    signal: ctx.signal,
    subscribe: hearSettle(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard)
    return result("DONE", { after, detail: "Dismissed: your pet is gone." });
  return result("UNCONFIRMED", {
    after,
    detail: "Your pet is still out.",
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

async function spellSummon(
  kind: "call" | "revive" | "dismiss",
  spell: SpellRef,
  after: PetAfter,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const heard = await settle<Heard>({
    match: summonHeard(kind, spell.id),
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.handle.cast(spell.id, ctx.handle.getControlState().selfGuid);
      }),
    signal: ctx.signal,
    subscribe: hearSettle(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (!heard)
    return result("UNCONFIRMED", {
      after,
      detail: `The server did not answer ${spell.name}.`,
      next: nextCall("journal", { about: "log" }),
      reason: "no_reply",
    });
  return summonHeardResult(kind, spell, after, heard);
}

function alreadyOut(kind: "call" | "revive" | "dismiss", ctx: PetCtx): void {
  if (kind === "call" && stateOf(ctx.handle).bar)
    throw new Refusal({
      detail: "your pet is already out.",
      next: nextCall("pet"),
      reason: "already_out",
    });
}

export async function summonFlow(
  kind: "call" | "revive" | "dismiss",
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const after: PetAfter = { do: kind, target: undefined, what: undefined };
  alreadyOut(kind, ctx);
  const pet = stateOf(ctx.handle).pet;
  if (kind === "dismiss" && pet !== undefined && !pet.canAbandon)
    return kennelDismiss(ctx, after);
  const spell = await ownerSpell(ctx, SUMMON_NAMES[kind]);
  return spellSummon(kind, spell, after, ctx);
}

export type SummonKind = "call" | "revive" | "dismiss";

export function summonCommand(
  kind: SummonKind,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  return summonFlow(kind, ctx);
}

export function attackCommand(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  return attackFlow(args, ctx);
}
