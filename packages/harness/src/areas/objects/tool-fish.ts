import type { AreaEvent, AreaEventOf, CombatEvent } from "@peon/core";
import type { ObjectRow } from "#harness/areas/objects/reads";
import type { UseAfter, UseCtx } from "#harness/areas/objects/tool";
import { releaseStale, withLootWatch } from "#harness/areas/objects/tool-open";
import { knownSpell } from "#harness/areas/spells/book";
import type { ToolResult } from "#harness/contract/result";
import { EventWaiter } from "#harness/loops/event-waiter";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const MAIN_HAND_SLOT = 15;
export const WEAPON_CLASS = 2;
export const FISHING_POLE_SUBCLASS = 20;
export const FISH_HOOK_WAIT_MS = 30_000;
const FISHING_ID = 35_591;
const POLE_WORD = "fishing pole";

type Heard = AreaEventOf<"objects"> | CombatEvent;

type FishEnd =
  | { type: "missed" }
  | { type: "escaped" }
  | { type: "cast"; reason: string };

type FishBite = { type: "bite"; bobber: bigint } | FishEnd;

export type FishAfter = {
  do: "fish";
  object: string;
  opened: boolean;
  taken: string[];
  text: string | undefined;
};

function endOf(event: Heard, spellId: number): FishEnd | undefined {
  if ("state" in event) {
    const outcome = event.state.lastOutcome;
    if (outcome?.kind !== "cast" || outcome.spellId !== spellId)
      return undefined;
    if (event.type !== "cast_failed" && event.type !== "cast_interrupted")
      return undefined;
    return { reason: outcome.reason ?? "failed", type: "cast" };
  }
  switch (event.type) {
    case "fish_not_hooked":
      return { type: "missed" };
    case "fish_escaped":
      return { type: "escaped" };
    default:
      return undefined;
  }
}

function biteOf(event: Heard, spellId: number): FishBite | undefined {
  if (!("state" in event) && event.type === "fish_hooked")
    return { bobber: event.bobber, type: "bite" };
  return endOf(event, spellId);
}

type BiteWait = {
  wait: (signal: AbortSignal) => Promise<FishBite | undefined>;
  stop: () => void;
};

function waitForBite(ctx: UseCtx, spellId: number): BiteWait {
  const heard = new EventWaiter<FishBite>();
  const offObjects = ctx.handle.onAreaEvent((area: AreaEvent) => {
    if (area.area !== "objects") return;
    const bite = biteOf(area.event, spellId);
    if (bite) heard.push(bite);
  });
  const offCombat = ctx.handle.onCombatEvent((combat: CombatEvent) => {
    const bite = biteOf(combat, spellId);
    if (bite) heard.push(bite);
  });
  return {
    stop: () => {
      offObjects();
      offCombat();
    },
    wait: (signal: AbortSignal) =>
      heard.find(() => true, FISH_HOOK_WAIT_MS, signal),
  };
}

function requireCalmLine(ctx: UseCtx): void {
  if (ctx.handle.objects.state().fishing !== undefined)
    throw new Refusal({
      detail: "the line is already in the water; wait for the bite.",
      next: nextCall("use", { do: "fish" }),
      reason: "already_fishing",
    });
}

async function requirePole(ctx: UseCtx): Promise<void> {
  const inventory = ctx.handle.getInventoryState();
  const held = inventory.slots.find(
    (slot) =>
      slot.status === "occupied" &&
      slot.region === "equipment" &&
      slot.slot === MAIN_HAND_SLOT,
  );
  const entry = held?.status === "occupied" ? held.item.entry : undefined;
  const name =
    held?.status === "occupied" ? (held.item.name?.toLowerCase() ?? "") : "";
  if (name.includes(POLE_WORD)) return;
  const template =
    entry === undefined
      ? undefined
      : await ctx.handle.getItemTemplate(entry).catch(() => undefined);
  if (
    template?.itemClass === WEAPON_CLASS &&
    template?.subclass === FISHING_POLE_SUBCLASS
  )
    return;
  throw new Refusal({
    detail: "equip a fishing pole in the main hand first.",
    next: nextCall("journal", { about: "bags" }),
    reason: "no_pole",
  });
}

function rowOf(ctx: UseCtx, bobber: bigint): ObjectRow | undefined {
  for (const row of ctx.handle.queryNearby()) {
    if (row.self || row.entity.guid !== bobber) continue;
    const ref = ctx.rt.refs.refOf(bobber);
    return {
      busy: false,
      compass: undefined,
      distance: row.distance ?? undefined,
      entry: row.entity.entry ?? FISHING_ID,
      guid: bobber,
      kind: "fishing node",
      locked: false,
      name: "Fishing Bobber",
      quest: false,
      ref,
      type: 17,
      x: row.position?.x,
      y: row.position?.y,
      z: row.position?.z,
    };
  }
  return undefined;
}

function failedEnd(end: FishEnd): ToolResult<FishAfter> {
  const after: FishAfter = {
    do: "fish",
    object: "",
    opened: false,
    taken: [],
    text: undefined,
  };
  if (end.type === "missed")
    return result("FAILED", {
      after,
      detail: "reeled in too early; no fish was hooked.",
      next: nextCall("use", { do: "fish" }),
      reason: "not_hooked",
    });
  if (end.type === "escaped")
    return result("FAILED", {
      after,
      detail: "waited too long after the bite; the fish escaped.",
      next: nextCall("use", { do: "fish" }),
      reason: "escaped",
    });
  return result("FAILED", {
    after,
    detail: `the cast failed: ${end.reason}.`,
    next: nextCall("use", { do: "fish" }),
    reason: end.reason,
  });
}

async function takeCatch(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<ToolResult<FishAfter>> {
  const { handle } = ctx;
  if (handle.getRewardsState().loot.phase === "open") await releaseStale(ctx);
  const caught = await withLootWatch(ctx, row, "Caught", async () => {
    const useOutcome = await ctx.rt.mutex.run(() =>
      handle.objects.act.use(row.guid),
    );
    if (!("ok" in useOutcome))
      throw new Refusal({
        detail: "the hooked fish slipped away before the bobber was used.",
        next: nextCall("use", { do: "fish" }),
        reason: "bobber_gone",
      });
    await ctx.rt.mutex.run(() => handle.openLoot(row.guid));
  });
  return result(caught.status, fishResult(row, caught));
}

function fishResult(
  row: ObjectRow,
  caught: ToolResult<UseAfter>,
): { after: FishAfter; detail: string; next?: string; reason?: string } {
  const after: FishAfter = { ...caught.after, do: "fish", object: row.ref };
  return {
    after,
    detail: caught.detail,
    ...(caught.next === undefined ? {} : { next: caught.next }),
    ...(caught.reason === undefined ? {} : { reason: caught.reason }),
  };
}

export async function fishFlow(ctx: UseCtx): Promise<ToolResult<FishAfter>> {
  const spell = await knownSpell(ctx.handle, "Fishing");
  if (!spell)
    throw new Refusal({
      detail: "you have not learned Fishing; learn it first.",
      next: nextCall("journal", { about: "spells" }),
      reason: "no_fishing",
    });
  await requirePole(ctx);
  requireCalmLine(ctx);
  const wait = waitForBite(ctx, spell.id);
  try {
    const sent = await ctx.rt.mutex
      .run(() => ctx.handle.cast(spell.id, 0n))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    if (sent !== undefined) {
      const code = sent instanceof Error ? sent.message : "unknown";
      throw new Refusal({
        detail: `the cast was not sent: ${code}.`,
        next: nextCall("journal", { about: "spells" }),
        reason: code,
      });
    }
    const bite = await wait.wait(ctx.signal);
    if (bite === undefined)
      return result("UNCONFIRMED", {
        after: {
          do: "fish",
          object: "",
          opened: false,
          taken: [],
          text: undefined,
        },
        detail: "no bite within 30 s; the bobber is still out.",
        next: nextCall("use", { do: "fish" }),
        reason: "no_bite",
      });
    if (bite.type !== "bite") return failedEnd(bite);
    const row = rowOf(ctx, bite.bobber);
    if (!row)
      throw new Refusal({
        detail: "the bobber is gone; the hook is lost.",
        next: nextCall("use", { do: "fish" }),
        reason: "bobber_gone",
      });
    return await takeCatch(ctx, row);
  } finally {
    wait.stop();
  }
}
