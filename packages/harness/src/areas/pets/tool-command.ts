import type { Static } from "@earendil-works/pi-ai";
import type { AreaEvent, AreaEventOf, CombatEvent } from "@peon/core";
import { isUnit, type UnitEntity } from "@peon/core";
import type { petParams } from "#harness/areas/pets/tool";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { Game } from "#harness/loops/game";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export type PetArgs = Static<typeof petParams>;
export type PetDo =
  | "call"
  | "dismiss"
  | "revive"
  | "attack"
  | "follow"
  | "stay"
  | "stop"
  | "stance"
  | "cast"
  | "autocast"
  | "rename"
  | "abandon"
  | "tame";

export type PetAfter = {
  do: PetDo | "status";
  target: string | undefined;
  what: string | undefined;
};

export type PetCtx = ToolCtx<PetAfter>;

export type PetsState = {
  bar:
    | {
        guid: bigint;
        family: number;
        react: string;
        command: string;
        spells: readonly { spell: number; autocast: string }[];
      }
    | undefined;
  cooldowns: readonly {
    infinite: boolean;
    readyAt: number | undefined;
    spell: number;
  }[];
  pet:
    | {
        guid: bigint;
        happiness: number;
        health: number;
        maxHealth: number;
        canAbandon: boolean;
        number?: number;
        nameTimestamp?: number;
      }
    | undefined;
  names?: Readonly<Record<number, { name: string; timestamp?: number }>>;
};

export const SETTLE_MS = 5000;
const HAPPINESS_LEVEL_SIZE = 333_000;

const FAMILIES: Readonly<Record<number, string>> = {
  1: "Wolf",
  2: "Cat",
  3: "Spider",
  4: "Bear",
  5: "Boar",
  6: "Crocolisk",
  7: "Carrion Bird",
  8: "Crab",
  9: "Gorilla",
  11: "Raptor",
  12: "Tallstrider",
  15: "Felhunter",
  16: "Voidwalker",
  17: "Succubus",
  19: "Doomguard",
  20: "Scorpid",
  21: "Turtle",
  23: "Imp",
  24: "Bat",
  25: "Hyena",
  26: "Bird of Prey",
  27: "Wind Serpent",
  28: "Remote Control",
  29: "Felguard",
  30: "Dragonhawk",
  31: "Ravager",
  32: "Warp Stalker",
  33: "Serpent",
  35: "Serpent",
  37: "Moth",
  38: "Chimaera",
  39: "Devilsaur",
  40: "Ghoul",
  41: "Silithid",
  42: "Worm",
  43: "Rhino",
  44: "Wasp",
  45: "Core Hound",
  46: "Spirit Beast",
};

const ACT_REASONS: Readonly<Record<string, string>> = {
  bad_slot: "that is not a pet bar slot.",
  dead: "your pet is dead.",
  hunter_pet_dismiss: "dismissing a hunter pet uses the Dismiss Pet spell.",
  no_pet: "you have no pet out.",
  not_autocastable: "that spell cannot be autocast.",
  not_known: "your pet does not know that.",
  not_removable: "orders and stances stay on the bar.",
  passive: "your pet cannot cast that.",
};

export function stateOf(handle: Game): PetsState {
  return handle.pets.state() as unknown as PetsState;
}

function happinessOf(power: number): string {
  if (power < HAPPINESS_LEVEL_SIZE) return "unhappy";
  if (power < HAPPINESS_LEVEL_SIZE * 2) return "content";
  return "happy";
}

export function petUnit(handle: Game, guid: bigint): UnitEntity | undefined {
  const entity = handle.getEntity(guid);
  return isUnit(entity) ? entity : undefined;
}

export function confirmedPetName(state: PetsState): string | undefined {
  const number = state.pet?.number;
  if (number === undefined) return undefined;
  const entry = state.names?.[number];
  if (entry === undefined) return undefined;
  const renamedAt = state.pet?.nameTimestamp ?? 0;
  return (entry.timestamp ?? 0) < renamedAt ? undefined : entry.name;
}

export function petNameOf(handle: Game, state: PetsState): string {
  const bar = state.bar;
  const unit = bar === undefined ? undefined : petUnit(handle, bar.guid);
  return confirmedPetName(state) ?? unit?.name ?? "Your pet";
}

function spellLabel(handle: Game, spell: number): string {
  return handle.spellDefinition(spell)?.name ?? `spell ${spell}`;
}

function spellLine(
  handle: Game,
  entry: { spell: number; autocast: string },
  now: number,
  cooldowns: PetsState["cooldowns"],
): string {
  const name = spellLabel(handle, entry.spell);
  const auto =
    entry.autocast === "passive" ? "passive" : `autocast ${entry.autocast}`;
  const row = cooldowns.find((cooldown) => cooldown.spell === entry.spell);
  if (row?.infinite) return `${name} (${entry.spell}): ${auto}, unavailable.`;
  const readyAt = row?.readyAt;
  const left = readyAt === undefined ? 0 : readyAt - now;
  const ready = left <= 0 ? "ready" : `ready in ${Math.ceil(left / 1000)} s`;
  return `${name} (${entry.spell}): ${auto}, ${ready}.`;
}

export function statusResult(handle: Game, now: number): ToolResult<PetAfter> {
  const after: PetAfter = { do: "status", target: undefined, what: undefined };
  const state = stateOf(handle);
  if (!state.bar)
    return result("DONE", { after, detail: "You have no pet out." });
  const bar = state.bar;
  const unit = petUnit(handle, bar.guid);
  const name = petNameOf(handle, state);
  const family = FAMILIES[bar.family] ?? `family ${bar.family}`;
  const level = unit === undefined ? "level unknown" : `level ${unit.level}`;
  const pet = state.pet;
  const health =
    pet === undefined ? "health unknown" : `${pet.health}/${pet.maxHealth}`;
  const mood =
    pet === undefined
      ? "mood unknown"
      : `${happinessOf(pet.happiness)} (${pet.happiness})`;
  const detail = `${name} (${family}), ${level}, ${health} hp, ${mood}: ${bar.react}, ${bar.command}.`;
  return result("DONE", {
    after,
    body: bar.spells.map((spell) =>
      spellLine(handle, spell, now, state.cooldowns),
    ),
    detail,
  });
}

export function refused(reason: string): Refusal {
  return new Refusal({
    detail: ACT_REASONS[reason] ?? `the server would ignore it (${reason}).`,
    next: nextCall("pet"),
    reason,
  });
}

export function throwUnlessOk(outcome: { ok: boolean; reason?: string }): void {
  if (!outcome.ok) throw refused(outcome.reason ?? "no_pet");
}

export type EntityHeard = { type: "entity" };

export function hearAll(handle: Game) {
  return (cb: (event: Heard | EntityHeard) => void) => {
    const offArea = handle.onAreaEvent((event: AreaEvent) =>
      cb({ area: event.area, event: event.event } as Heard),
    );
    const offEntity = handle.onEntityEvent((event) =>
      cb({ entity: event, type: "entity" } as unknown as EntityHeard),
    );
    return () => {
      offArea();
      offEntity();
    };
  };
}

type PetBarEvent = Extract<AreaEventOf<"pets">, { type: "bar" }>;

function barGuid(event: Heard | EntityHeard): bigint | undefined {
  if ("area" in event)
    return event.area === "pets" &&
      event.event.type === "bar" &&
      !event.event.cleared
      ? (event.event as PetBarEvent & { cleared: false }).bar.guid
      : undefined;
  return undefined;
}

export async function settleBar(
  ctx: PetCtx,
  match: (bar: { guid: bigint; react: string; command: string }) => boolean,
  send: () => void,
): Promise<{ guid: bigint; react: string; command: string } | undefined> {
  const heard = await settle<Heard | EntityHeard>({
    match: (event) => {
      if (barGuid(event) === undefined) return false;
      const bar = stateOf(ctx.handle).bar;
      return bar !== undefined && match(bar);
    },
    send: () => ctx.rt.mutex.run(send),
    signal: ctx.signal,
    subscribe: hearAll(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  void heard;
  const bar = stateOf(ctx.handle).bar;
  return bar !== undefined && match(bar) ? bar : undefined;
}

function orderFlow(
  order: "stay" | "follow",
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  return simpleFlow({ do: order, target: undefined, what: undefined }, ctx, {
    match: (bar) => bar.command === order,
    send: () => {
      const outcome = ctx.handle.pets.act.petCommand(order);
      throwUnlessOk(outcome);
    },
    settled: `${order === "follow" ? "Following" : "Staying"}: your pet is on ${order}.`,
    waiting: `Your pet did not show ${order} on the bar.`,
  });
}

async function simpleFlow(
  after: PetAfter,
  ctx: PetCtx,
  init: {
    match: (bar: { guid: bigint; react: string; command: string }) => boolean;
    send: () => void;
    settled: string;
    waiting: string;
  },
): Promise<ToolResult<PetAfter>> {
  try {
    const bar = await settleBar(ctx, init.match, init.send);
    if (bar) return result("DONE", { after, detail: init.settled });
  } catch (error) {
    if (error instanceof Refusal) throw error;
    throw error;
  }
  return result("UNCONFIRMED", {
    after,
    detail: init.waiting,
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

const STANCES = ["passive", "defensive", "aggressive"] as const;
type Stance = (typeof STANCES)[number];

function stanceOf(what: string | undefined): Stance {
  const wanted = what?.trim().toLowerCase() ?? "";
  const stance = STANCES.find((name) => name === wanted);
  if (!stance)
    throw new Refusal({
      detail: 'name the stance: "passive", "defensive" or "aggressive".',
      next: nextCall("pet", { do: "stance", what: "passive" }),
      reason: "missing_stance",
    });
  return stance;
}

async function stanceFlow(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const stance = stanceOf(args.what);
  const after: PetAfter = { do: "stance", target: undefined, what: stance };
  const bar = await settleBar(
    ctx,
    (row) => row.react === stance,
    () => {
      const outcome = ctx.handle.pets.act.petStance(stance);
      throwUnlessOk(outcome);
    },
  );
  if (bar) return result("DONE", { after, detail: `Your pet is ${stance}.` });
  return result("UNCONFIRMED", {
    after,
    detail: "Your pet did not show the new stance on the bar.",
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

async function stopFlow(ctx: PetCtx): Promise<ToolResult<PetAfter>> {
  const after: PetAfter = { do: "stop", target: undefined, what: undefined };
  const bar = await settleBar(
    ctx,
    (row) => row.command === "follow",
    () => {
      const stopped = ctx.handle.pets.act.petStopAttack();
      throwUnlessOk(stopped);
      const followed = ctx.handle.pets.act.petCommand("follow");
      throwUnlessOk(followed);
    },
  );
  if (bar)
    return result("DONE", { after, detail: "Stopped: your pet is following." });
  return result("UNCONFIRMED", {
    after,
    detail: "Your pet did not show follow on the bar.",
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

export function petTarget(handle: Game, guid: bigint): bigint | undefined {
  const target = petUnit(handle, guid)?.target ?? 0n;
  return target === 0n ? undefined : target;
}

export function orderCommand(
  order: "stay" | "follow" | "stop",
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  if (order === "stop") return stopFlow(ctx);
  return orderFlow(order, ctx);
}

export function stanceCommand(
  args: PetArgs,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  return stanceFlow(args, ctx);
}

export function castReply(event: Heard, spellId: number): boolean | undefined {
  if ("area" in event) {
    if (event.area !== "spells") return undefined;
    const inner = event.event;
    if (inner.type === "channel_start" && inner.spellId === spellId)
      return true;
    return undefined;
  }
  const outcome = (event as CombatEvent).state.lastOutcome;
  if (outcome?.kind !== "cast" || outcome.spellId !== spellId) return undefined;
  if (event.type === "cast_succeeded") return true;
  if (event.type === "cast_failed" || event.type === "cast_interrupted")
    return false;
  return undefined;
}

export function hearSettle(handle: Game) {
  return hearCasts(handle);
}
