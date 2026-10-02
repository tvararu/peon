import type { AreaActsOf, Unsubscribe } from "@peon/core";
import {
  castReply,
  type PetAfter,
  type PetArgs,
  type PetCtx,
  refused,
  SETTLE_MS,
  stateOf,
  throwUnlessOk,
} from "#harness/areas/pets/tool-command";
import { unitOf } from "#harness/areas/pets/tool-summon";
import { knownSpell, wholeNumber } from "#harness/areas/spells/book";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import type { Game } from "#harness/loops/game";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type SpellTarget = Parameters<AreaActsOf<"pets">["petCast"]>[1];

const SPLIT_WORDS = /\s+/;
const POLL_MS = 250;
const CHASE_MS = 20_000;
const TAME_BEAST = "Tame Beast";
const TAME_SETTLE_MS = 35_000;

type PetSpell = { id: number; name: string };

const VEHICLE_FLAGS = 0x8_00;
const VEHICLE_BUTTON_FIRST = 8;
const VEHICLE_BUTTON_LAST = 12;

function vehicleSpellsOf(bar: {
  flags: number;
  slots: readonly { action: number; type: number }[] | undefined;
}): readonly PetSpell[] {
  if (Math.floor(bar.flags / VEHICLE_FLAGS) % 2 === 0) return [];
  return (bar.slots ?? [])
    .filter(
      (slot) =>
        slot.action !== 0 &&
        slot.type >= VEHICLE_BUTTON_FIRST &&
        slot.type <= VEHICLE_BUTTON_LAST,
    )
    .map((slot) => ({ id: slot.action, name: `spell ${slot.action}` }));
}

function barSpells(handle: Game): readonly PetSpell[] {
  const bar = stateOf(handle).bar as
    | {
        flags: number;
        slots: readonly { action: number; type: number }[] | undefined;
        spells: readonly { spell: number }[] | undefined;
      }
    | undefined;
  if (!bar) return [];
  const pet = (bar.spells ?? []).map((row) => ({
    id: row.spell,
    name: handle.spellDefinition(row.spell)?.name ?? `spell ${row.spell}`,
  }));
  if (pet.length > 0) return pet;
  const vehicle = vehicleSpellsOf(bar);
  return vehicle.map((spell) => ({
    id: spell.id,
    name: handle.spellDefinition(spell.id)?.name ?? spell.name,
  }));
}

function missingSpell(handle: Game, wanted: string): Refusal {
  const names = barSpells(handle).map((spell) => spell.name);
  return new Refusal({
    body: names,
    detail:
      wanted === ""
        ? "name one of your pet's spells in what."
        : `your pet does not have "${wanted}".`,
    next: nextCall("pet"),
    reason: wanted === "" ? "missing_spell" : "unknown_pet_spell",
  });
}

export function petSpellOf(handle: Game, wanted: string): PetSpell {
  if (!stateOf(handle).bar) throw refused("no_pet");
  const text = wanted.trim();
  const spells = barSpells(handle);
  const id = wholeNumber(text);
  const found =
    id === undefined
      ? spells.find((spell) => spell.name.toLowerCase() === text.toLowerCase())
      : spells.find((spell) => spell.id === id);
  if (!found) throw missingSpell(handle, text);
  return found;
}

function targetOf(
  ctx: PetCtx,
  args: PetArgs,
): { spec: SpellTarget; ref: string | undefined } {
  if ((args.target?.trim() ?? "") === "")
    return { ref: undefined, spec: { kind: "none" } };
  const found = unitOf(ctx, args, "cast on");
  return {
    ref: found.view.ref,
    spec: { guid: found.guid, kind: "unit" },
  };
}

function cooldownAt(handle: Game, spell: number): number | "infinite" | 0 {
  const row = stateOf(handle).cooldowns.find((entry) => entry.spell === spell);
  if (!row) return 0;
  return row.infinite ? "infinite" : (row.readyAt ?? 0);
}

type Tick = { tick: true };
type Watched = Heard | Tick;

function hearCooldowns(handle: Game) {
  const hear = hearCasts(handle);
  return (cb: (event: Watched) => void): Unsubscribe => {
    const off = hear(cb);
    const timer = setInterval(() => cb({ tick: true }), POLL_MS);
    return () => {
      clearInterval(timer);
      off();
    };
  };
}

function failedCast(
  after: PetAfter,
  failure: string,
  spell: string,
): ToolResult<PetAfter> {
  const base = `${spell} failed: ${failure}.`;
  return result("FAILED", {
    after,
    detail:
      failure === "not_ready"
        ? `${base} It is on cooldown: autocast may have just used it, so wait a few seconds and check the pet status.`
        : base,
    next: nextCall("pet"),
    reason: "cast_failed",
  });
}

type CastWatch = {
  chasing: boolean;
  failure: string | undefined;
  sent: { confirmed: boolean; count: number } | undefined;
  ticks: number;
};

const CHASE_REASONS: Record<string, true> = {
  dont_report: true,
  line_of_sight: true,
  out_of_range: true,
};

function noteFailure(watch: CastWatch, reason: string): boolean {
  if (reason === "out_of_range" || reason === "line_of_sight")
    watch.chasing = true;
  else if (reason !== "dont_report") {
    watch.failure = reason;
    return true;
  }
  return false;
}

function matchFailure(
  watch: CastWatch,
  spell: number,
  inner: { type: string; spell?: number; castCount?: number; reason?: string },
): boolean | undefined {
  if (inner.type !== "cast_failed" || inner.spell !== spell) return undefined;
  if (inner.castCount === watch.sent?.count)
    return noteFailure(watch, inner.reason ?? "");
  if (
    watch.chasing &&
    (inner.reason === undefined || CHASE_REASONS[inner.reason])
  )
    return noteFailure(watch, inner.reason ?? "");
  return false;
}

function castWatcher(handle: Game, spell: number) {
  const before = cooldownAt(handle, spell);
  const watch: CastWatch = {
    chasing: false,
    failure: undefined,
    sent: undefined,
    ticks: 0,
  };
  const cooled = () => {
    const now = cooldownAt(handle, spell);
    return watch.sent !== undefined && now !== 0 && now !== before;
  };
  const match = (event: Watched): boolean => {
    if ("tick" in event) {
      watch.ticks++;
      return cooled() || (!watch.chasing && watch.ticks * POLL_MS >= SETTLE_MS);
    }
    if (!("area" in event) || event.area !== "pets") return false;
    const failed = matchFailure(watch, spell, event.event);
    if (failed !== undefined) return failed;
    return event.event.type === "bar" && cooled();
  };
  return { cooled, match, watch };
}

export async function castFlow(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const spell = petSpellOf(ctx.handle, args.what ?? "");
  const target = targetOf(ctx, args);
  const after: PetAfter = {
    do: "cast",
    target: target.ref,
    what: spell.name,
  };
  const { cooled, match, watch } = castWatcher(ctx.handle, spell.id);
  await settle<Watched>({
    match,
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.signal.throwIfAborted();
        const outcome = ctx.handle.pets.act.petCast(spell.id, target.spec);
        throwUnlessOk(outcome);
        if (outcome.ok)
          watch.sent = {
            confirmed: outcome.confirmed,
            count: outcome.castCount,
          };
      }),
    signal: ctx.signal,
    subscribe: hearCooldowns(ctx.handle),
    timeoutMs: CHASE_MS,
  });
  if (watch.failure !== undefined)
    return failedCast(after, watch.failure, spell.name);
  if (cooled() && watch.sent?.confirmed === false)
    return result("UNCONFIRMED", {
      after,
      detail: `${spell.name} went out but its definition is not loaded, so the cast is unchecked.`,
      next: nextCall("pet"),
      reason: "unchecked",
    });
  if (cooled())
    return result("DONE", {
      after,
      detail: watch.chasing
        ? `Your pet closed in and cast ${spell.name}.`
        : `Your pet cast ${spell.name}.`,
    });
  if (watch.chasing)
    return result("UNCONFIRMED", {
      after,
      detail: `Your pet is closing in on the target and will cast ${spell.name} when it arrives.`,
      next: nextCall("pet"),
      reason: "closing_in",
    });
  return result("UNCONFIRMED", {
    after,
    detail: `The server did not show ${spell.name} on cooldown.`,
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

const STATES = { off: false, on: true } as const;

function autocastRequest(handle: Game, what: string) {
  const words = what.trim().split(SPLIT_WORDS);
  const word = words.at(-1)?.toLowerCase() ?? "";
  if (word !== "on" && word !== "off")
    throw new Refusal({
      detail: 'say which: what "Growl on" or "Growl off".',
      next: nextCall("pet", { do: "autocast", what: "Growl off" }),
      reason: "missing_state",
    });
  const spell = petSpellOf(handle, words.slice(0, -1).join(" "));
  return { on: STATES[word], spell };
}

export async function autocastFlow(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const { on, spell } = autocastRequest(ctx.handle, args.what ?? "");
  const word = on ? "on" : "off";
  const after: PetAfter = {
    do: "autocast",
    target: undefined,
    what: `${spell.name} ${word}`,
  };
  const shown = () =>
    stateOf(ctx.handle).bar?.spells.find((row) => row.spell === spell.id)
      ?.autocast;
  if (shown() === word)
    return result("DONE", {
      after,
      detail: `${spell.name} autocast is already ${word}.`,
    });
  const heard = await settle<Heard>({
    match: (event) =>
      "area" in event &&
      event.area === "pets" &&
      event.event.type === "bar" &&
      shown() === word,
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.signal.throwIfAborted();
        throwUnlessOk(ctx.handle.pets.act.petAutocast(spell.id, on));
      }),
    signal: ctx.signal,
    subscribe: hearCasts(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard)
    return result("DONE", {
      after,
      detail: `${spell.name} autocast is ${word}.`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `The bar did not show ${spell.name} autocast ${word}.`,
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

function tameHeard(event: Heard, spellId: number): "bar" | "failed" | false {
  if ("area" in event) {
    if (event.area !== "pets") return false;
    if (event.event.type === "tame_failed") return "failed";
    return event.event.type === "bar" && !event.event.cleared ? "bar" : false;
  }
  return castReply(event, spellId) === false ? "failed" : false;
}

export async function tameFlow(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  if (stateOf(ctx.handle).bar)
    throw new Refusal({
      detail:
        "you have a pet out; Tame Beast does nothing then. Dismiss it first.",
      next: nextCall("pet", { do: "dismiss" }),
      reason: "already_out",
    });
  const found = unitOf(ctx, args, "tame");
  const spell = await knownSpell(ctx.handle, TAME_BEAST);
  if (!spell)
    throw new Refusal({
      detail: `you do not know ${TAME_BEAST}.`,
      next: nextCall("journal", { about: "spells" }),
      reason: "unknown_spell",
    });
  const after: PetAfter = {
    do: "tame",
    target: found.view.ref,
    what: undefined,
  };
  const heard = await settle<Heard>({
    match: (event) => tameHeard(event, spell.id) !== false,
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.signal.throwIfAborted();
        ctx.handle.cast(spell.id, found.guid);
      }),
    signal: ctx.signal,
    subscribe: hearCasts(ctx.handle),
    timeoutMs: TAME_SETTLE_MS,
  });
  const kind = heard ? tameHeard(heard, spell.id) : false;
  if (kind === "bar")
    return result("DONE", {
      after,
      detail: `${found.view.name} is tamed: your new pet is out.`,
    });
  if (kind === "failed") {
    const reason =
      heard && "area" in heard && heard.event.type === "tame_failed"
        ? heard.event.reason
        : "cast_failed";
    return result("FAILED", {
      after,
      detail: `Taming ${found.view.name} failed: ${reason}.`,
      next: nextCall("look"),
      reason: "tame_failed",
    });
  }
  return result("UNCONFIRMED", {
    after,
    detail: `No new pet appeared after ${TAME_BEAST} on ${found.view.name}.`,
    next: nextCall("pet"),
    reason: "no_reply",
  });
}
