import type { AreaActsOf } from "@peon/core";
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
const TAME_BEAST = "Tame Beast";
const TAME_SETTLE_MS = 35_000;

type PetSpell = { id: number; name: string };

function barSpells(handle: Game): readonly PetSpell[] {
  const bar = stateOf(handle).bar;
  return (bar?.spells ?? []).map((row) => ({
    id: row.spell,
    name: handle.spellDefinition(row.spell)?.name ?? `spell ${row.spell}`,
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

function detailOf(failure: string, spell: string, near: boolean): string {
  const base = `${spell} failed: ${failure}.`;
  if (near)
    return `${base} The pet must stand next to the target: send it with attack first, then cast again.`;
  if (failure === "not_ready")
    return `${base} It is on cooldown: autocast may have just used it, so wait a few seconds and check the pet status.`;
  return base;
}

function failedCast(input: {
  after: PetAfter;
  failure: string;
  spell: string;
  target: string | undefined;
}): ToolResult<PetAfter> {
  const { after, failure, spell, target } = input;
  const near = failure === "out_of_range" && target !== undefined;
  return result("FAILED", {
    after,
    detail: detailOf(failure, spell, near),
    next: near ? nextCall("pet", { do: "attack", target }) : nextCall("pet"),
    reason: "cast_failed",
  });
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
  const before = cooldownAt(ctx.handle, spell.id);
  let sent: { confirmed: boolean } | undefined;
  let failure: string | undefined;
  const heard = await settle<Heard>({
    match: (event) => {
      if ("area" in event && event.area === "pets") {
        const inner = event.event;
        if (inner.type === "cast_failed" && inner.spell === spell.id) {
          failure = inner.reason;
          return true;
        }
        if (inner.type === "bar" && sent) {
          const now = cooldownAt(ctx.handle, spell.id);
          return now !== 0 && now !== before;
        }
      }
      return false;
    },
    send: () =>
      ctx.rt.mutex.run(() => {
        const outcome = ctx.handle.pets.act.petCast(spell.id, target.spec);
        throwUnlessOk(outcome);
        if (outcome.ok) sent = { confirmed: outcome.confirmed };
      }),
    signal: ctx.signal,
    subscribe: hearCasts(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (failure !== undefined)
    return failedCast({
      after,
      failure,
      spell: spell.name,
      target: target.ref,
    });
  if (heard && sent?.confirmed === false)
    return result("UNCONFIRMED", {
      after,
      detail: `${spell.name} went out but its definition is not loaded, so the cast is unchecked.`,
      next: nextCall("pet"),
      reason: "unchecked",
    });
  if (heard)
    return result("DONE", { after, detail: `Your pet cast ${spell.name}.` });
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
