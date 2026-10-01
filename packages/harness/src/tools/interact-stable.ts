import type { AreaEvent, AreaEventOf } from "@peon/core";
import { bounded } from "@peon/core/lib/abort";
import type { InteractAfter } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import type { Game } from "#harness/loops/game";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  send,
  type TalkExtra,
} from "#harness/tools/interact-quest";
import { nextCall } from "#harness/tools/next-call";

type StableListing = Extract<
  AreaEventOf<"pets">,
  { type: "stable_list" }
>["stable"];
type StablePet = StableListing["pets"][number];
type StableOutcome = Extract<
  AreaEventOf<"pets">,
  { type: "stable_result" }
>["result"];

type PetsState = {
  bar: { guid: bigint } | undefined;
  stable: StableListing | undefined;
};

const STABLE_MASTER = "stable_master";
const NO_ANSWER = "no_answer";
const MONEY_WAIT_MS = 500;

async function waitMoneyMove(
  ctx: ToolCtx<InteractAfter>,
  before: number | undefined,
): Promise<number | undefined> {
  if (before === undefined) return undefined;
  const moved = Promise.withResolvers<number | undefined>();
  const off = ctx.handle.onEntityEvent(() => {
    const now = ctx.handle.getInventoryState().coinage;
    if (now !== undefined && now !== before) moved.resolve(now);
  });
  try {
    return await bounded(moved.promise, ctx.signal, MONEY_WAIT_MS, "no money update");
  } catch {
    return undefined;
  } finally {
    off();
  }
}

function stateOf(handle: Game): PetsState {
  return handle.pets.state() as unknown as PetsState;
}

function listStable(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<StableListing | undefined> {
  return settle<AreaEvent>({
    match: (event) =>
      event.area === "pets" &&
      ((event.event.type === "stable_list" &&
        event.event.stable.npc === npc.guid) ||
        (event.event.type === "unanswered" &&
          event.event.request === "stable")),
    send: send(ctx, () => {
      ctx.signal?.throwIfAborted();
      ctx.handle.pets.act.listStabledPets(npc.guid);
    }),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onAreaEvent(cb),
    timeoutMs: ANSWER_MS,
  }).then((event) => {
    if (event && event.area === "pets" && event.event.type === "stable_list")
      return event.event.stable;
  });
}

function stateText(pet: StablePet): string {
  if (pet.state === "active") return "out";
  if (pet.state === "stabled") return "stabled";
  return "unknown";
}

function stableText(listing: StableListing): string {
  const stabled = listing.pets.filter((pet) => pet.state === "stabled");
  const lines = listing.pets.map(
    (pet, index) =>
      `${index + 1}. ${pet.name} (level ${pet.level}, ${stateText(pet)})`,
  );
  return `Stabled pets: ${lines.length === 0 ? "none" : lines.join("; ")}. ${Math.max(listing.slots - stabled.length, 0)} of ${listing.slots} slots free.`;
}

export const stableExtra: TalkExtra = async ({ ctx, npc }) => {
  if (!npc.unit.roles.includes(STABLE_MASTER)) return { after: {}, lines: [] };
  const listing = await listStable(ctx, npc);
  if (!listing)
    return {
      after: {},
      lines: [`${npcLabel(npc)} did not open the stable in 5 s.`],
    };
  return { after: {}, lines: [stableText(listing)] };
};

type StableCall = {
  do: "stable" | "unstable" | "buy_slot";
  send: (ctx: ToolCtx<InteractAfter>, npc: NpcTarget) => void;
  verb: string;
};

function noPet(): Refusal {
  return new Refusal({
    detail: "you have no pet out.",
    next: nextCall("pet"),
    reason: "no_pet",
  });
}

const LINE_NUMBER = /^\d+$/;

function nameTargets(
  pets: readonly StablePet[],
  text: string,
): readonly StablePet[] {
  if (LINE_NUMBER.test(text)) {
    const row = pets[Number(text) - 1];
    return row ? [row] : [];
  }
  const lowered = text.toLowerCase();
  return pets.filter((pet) => pet.name.toLowerCase() === lowered);
}

function pickPet(
  listing: StableListing,
  npc: NpcTarget,
  what: string | undefined,
): StablePet {
  const lines = listing.pets.map(
    (pet, index) => `${index + 1}. ${pet.name} (${stateText(pet)})`,
  );
  const retry = nextCall("interact", { do: "unstable", npc: npc.unit.ref });
  if (what === undefined)
    throw new Refusal({
      body: lines,
      detail: `say which stabled pet to call: what "<name>".`,
      next: retry,
      reason: "what_needed",
    });
  const found = nameTargets(listing.pets, what.trim());
  const stabled = found.filter((pet) => pet.state === "stabled");
  if (stabled.length === 1 && found.length === 1)
    return stabled[0] as StablePet;
  if (found.length === 0)
    throw new Refusal({
      body: lines,
      detail: `${npcLabel(npc)} stables no pet called "${what}".`,
      next: retry,
      reason: "no_match",
    });
  if (found.length > 1)
    throw new Refusal({
      body: found.map(
        (pet) =>
          `${listing.pets.indexOf(pet) + 1}. ${pet.name} (${stateText(pet)})`,
      ),
      detail: `"${what}" names ${found.length} pets: pick a stabled one by line number.`,
      next: retry,
      reason: "ambiguous_pet",
    });
  throw new Refusal({
    body: lines,
    detail: `"${what}" is out, not stabled: pick a stabled pet by line number.`,
    next: retry,
    reason: "not_stabled",
  });
}

function waitResult(
  ctx: ToolCtx<InteractAfter>,
  call: StableCall,
  npc: NpcTarget,
): Promise<StableOutcome | undefined> {
  return settle<AreaEvent>({
    match: (event) =>
      event.area === "pets" &&
      (event.event.type === "stable_result" ||
        (event.event.type === "unanswered" &&
          event.event.request === "stable")),
    send: send(ctx, () => {
      ctx.signal?.throwIfAborted();
      call.send(ctx, npc);
    }),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onAreaEvent(cb),
    timeoutMs: ANSWER_MS,
  }).then((event) => {
    if (event && event.area === "pets" && event.event.type === "stable_result")
      return event.event.result;
  });
}

type StableAfter = {
  after: InteractAfter;
  body: string[];
  detail: string;
  next?: string;
  reason?: string;
};

async function runStableCall(
  call: StableCall,
  done: string,
  args: { ctx: ToolCtx<InteractAfter>; npc: NpcTarget },
): Promise<StableAfter> {
  const { ctx, npc } = args;
  const before = ctx.handle.getInventoryState().coinage;
  const outcome = await waitResult(ctx, call, npc);
  const moved =
    outcome === "slot_bought" ? await waitMoneyMove(ctx, before) : undefined;
  const after = {
    ...baseAfter(ctx, npc, call.do),
    money:
      moved === undefined || before === undefined
        ? moneyChange(ctx, before)
        : { after: moved, before },
  };
  if (outcome === undefined)
    return {
      after,
      body: [],
      detail: `${npcLabel(npc)} did not answer the ${call.verb} in 5 s.`,
      next: nextCall("interact", { do: call.do, npc: npc.unit.ref }),
      reason: NO_ANSWER,
    };
  switch (outcome) {
    case "stabled":
    case "unstabled":
    case "slot_bought":
      return {
        after,
        body: [],
        detail: `${done}${moneyText(after.money)}`,
      };
    case "money":
    case "refused":
    case "exotic":
      return {
        after,
        body: [],
        detail: `${npcLabel(npc)} refused the ${call.verb} (${outcome})${moneyText(after.money)}.`,
        next: nextCall("pet"),
        reason: outcome,
      };
    default:
      return {
        after,
        body: [],
        detail: `${npcLabel(npc)} answered the ${call.verb} with an unknown result${moneyText(after.money)}.`,
        next: nextCall("pet"),
        reason: "unknown_result",
      };
  }
}

function settleStatus(
  reason: string | undefined,
): "DONE" | "FAILED" | "UNCONFIRMED" {
  if (reason === undefined) return "DONE";
  if (reason === NO_ANSWER) return "UNCONFIRMED";
  return "FAILED";
}

export const stableStep: InteractStep = async ({ ctx, npc }) => {
  if (!stateOf(ctx.handle).bar) throw noPet();
  const done = await runStableCall(
    {
      do: "stable",
      send: (tool, target) => {
        tool.handle.pets.act.stablePet(target.guid);
      },
      verb: "stable",
    },
    "Your pet is stabled.",
    { ctx, npc },
  );
  return result(settleStatus(done.reason), done);
};

export const unstableStep: InteractStep = async ({ args, ctx, npc }) => {
  const listing = await listStable(ctx, npc);
  if (!listing)
    throw new Refusal({
      detail: `${npcLabel(npc)} did not open the stable in 5 s.`,
      next: nextCall("interact", { do: "unstable", npc: npc.unit.ref }),
      reason: NO_ANSWER,
      status: "UNCONFIRMED",
    });
  const pet = pickPet(listing, npc, args.what);
  const out = stateOf(ctx.handle).bar !== undefined;
  const done = await runStableCall(
    {
      do: "unstable",
      send: (tool, target) => {
        if (out) tool.handle.pets.act.swapStabledPet(target.guid, pet.number);
        else tool.handle.pets.act.unstablePet(target.guid, pet.number);
      },
      verb: "unstable",
    },
    `${pet.name} is out.`,
    { ctx, npc },
  );
  return result(settleStatus(done.reason), done);
};

export const buySlotStep: InteractStep = async ({ ctx, npc }) => {
  const done = await runStableCall(
    {
      do: "buy_slot",
      send: (tool, target) => {
        tool.handle.pets.act.buyStableSlot(target.guid);
      },
      verb: "stable slot",
    },
    "Bought a stable slot.",
    { ctx, npc },
  );
  return result(settleStatus(done.reason), done);
};
