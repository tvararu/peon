import type { AreaActsOf } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import {
  asCatalog,
  type TalentsAfter,
  type TalentsCatalog,
  type TalentsCtx,
  type TalentsSnapshot,
} from "#harness/areas/talents/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type ApplyGlyph = AreaActsOf<"talents">["applyGlyph"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;

type RemoveGlyph = AreaActsOf<"talents">["removeGlyph"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;

export type GlyphItem = {
  bag: number;
  entry: number;
  label: string;
  slot: number;
};

const CARRY_REGIONS = ["backpack", "bag_item"] as const;
const GLYPH_KINDS: Record<number, string> = { 0: "major", 1: "minor" };
const AT_REF = /^bag (\d+) slot (\d+)$/i;
const ITEM_REF = /^item (\d+)$/i;

type SlotOf = TalentsSnapshot["slots"][number];

export function glyphArgsOf(args: { item?: unknown; slot?: unknown }): {
  item: string;
  slot: string | number;
} {
  if (typeof args.item !== "string" || args.item.trim().length === 0)
    throw new Refusal({
      detail: "name the glyph item to put in a slot.",
      next: nextCall("journal", { about: "bags" }),
      reason: "missing_item",
    });
  if (
    (typeof args.slot !== "string" && typeof args.slot !== "number") ||
    (typeof args.slot === "string" && args.slot.trim().length === 0)
  )
    throw new Refusal({
      detail: "name the glyph slot, 1-6 or a kind shown by show.",
      next: nextCall("talents", { do: "show" }),
      reason: "missing_slot",
    });
  return { item: args.item, slot: args.slot };
}

export function unglyphSlotOf(slot: unknown): number {
  if (
    typeof slot === "number" &&
    Number.isInteger(slot) &&
    slot >= 1 &&
    slot <= 6
  )
    return slot - 1;
  throw new Refusal({
    detail: "name the glyph slot to clear, 1-6.",
    next: nextCall("talents", { do: "show" }),
    reason: "missing_slot",
  });
}

function carried(ctx: TalentsCtx): GlyphItem[] {
  const state = ctx.handle.getInventoryState();
  return state.slots.flatMap((entry) => {
    if (entry.status !== "occupied") return [];
    if (!CARRY_REGIONS.includes(entry.region as (typeof CARRY_REGIONS)[number]))
      return [];
    return [
      {
        bag: entry.bag,
        entry: entry.item.entry ?? 0,
        guid: entry.guid,
        label: entry.item.name ?? `item ${entry.item.entry ?? 0}`,
        slot: entry.slot,
      },
    ];
  });
}

export function findGlyphItem(ctx: TalentsCtx, text: string): GlyphItem {
  const pool = carried(ctx);
  const at = atRef(pool, text.trim());
  if (at) return at;
  return namedGlyph(pool, text.trim());
}

function atRef(pool: GlyphItem[], trimmed: string): GlyphItem | undefined {
  const at = AT_REF.exec(trimmed);
  if (at?.[1] === undefined || at[2] === undefined) return undefined;
  const bag = Number(at[1]);
  const slot = Number(at[2]);
  const held = pool.find(
    (candidate) => candidate.bag === bag && candidate.slot === slot,
  );
  if (!held)
    throw new Refusal({
      detail: `bag ${bag} slot ${slot} holds nothing to put in a glyph slot.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "no_such_item",
    });
  return {
    bag: held.bag,
    entry: held.entry,
    label: held.label,
    slot: held.slot,
  };
}

function namedGlyph(pool: GlyphItem[], trimmed: string): GlyphItem {
  const id = ITEM_REF.exec(trimmed)?.[1];
  const lowered = trimmed.toLowerCase();
  const matches = pool.filter((candidate) =>
    id
      ? candidate.entry === Number(id)
      : candidate.label.toLowerCase() === lowered,
  );
  const near =
    matches.length === 0 && !id
      ? pool.filter((candidate) =>
          candidate.label.toLowerCase().includes(lowered),
        )
      : matches;
  if (near.length === 0)
    throw new Refusal({
      detail: `no carried item matches "${trimmed}".`,
      next: nextCall("journal", { about: "bags" }),
      reason: "no_such_item",
    });
  if (near.length > 1)
    throw new Refusal({
      detail: `"${trimmed}" matches more than one item; name one bag and slot.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "ambiguous_item",
    });
  const held = near[0];
  if (!held)
    throw new Refusal({
      detail: `no carried item matches "${trimmed}".`,
      next: nextCall("journal", { about: "bags" }),
      reason: "no_such_item",
    });
  return {
    bag: held.bag,
    entry: held.entry,
    label: held.label,
    slot: held.slot,
  };
}

function flagsKind(typeFlags: number | undefined): string {
  if (typeFlags === undefined) return "unknown";
  return GLYPH_KINDS[typeFlags] ?? "unknown";
}

function openSlots(
  catalog: TalentsCatalog,
  state: TalentsSnapshot,
  kind: string,
): SlotOf[] {
  return state.slots.filter((slot) => {
    if (slot.unlocked === false) return false;
    return flagsKind(catalog.slotType(slot.typeId ?? -1)?.typeFlags) === kind;
  });
}

export function glyphSlotOf(
  catalog: TalentsCatalog | undefined,
  state: TalentsSnapshot,
  slot: string | number,
): { index: number; kind: string } {
  if (typeof slot === "number") {
    if (!Number.isInteger(slot) || slot < 1 || slot > 6)
      throw new Refusal({
        detail: `there is no glyph slot ${slot}; slots run 1-6.`,
        next: nextCall("talents", { do: "show" }),
        reason: "bad_slot",
      });
    const entry = state.slots[slot - 1];
    if (entry?.unlocked === false)
      throw new Refusal({
        detail: `glyph slot ${slot} is locked.`,
        next: nextCall("talents", { do: "show" }),
        reason: "slot_locked",
      });
    return { index: slot - 1, kind: slotKind(catalog, entry?.typeId) };
  }
  const kind = slot.trim().toLowerCase();
  if (kind !== "major" && kind !== "minor")
    throw new Refusal({
      detail: `there is no glyph slot "${slot}"; use 1-6 or a kind shown by show.`,
      next: nextCall("talents", { do: "show" }),
      reason: "bad_slot",
    });
  if (catalog === undefined)
    throw new Refusal({
      detail: `${slot} needs talent data; use a slot number.`,
      next: nextCall("talents", { do: "show" }),
      reason: "names_need_talent_data",
    });
  const open = openSlots(catalog, state, kind);
  const picked = open.find((entry) => (entry.glyphId ?? 0) === 0) ?? open[0];
  if (!picked)
    throw new Refusal({
      detail: `no ${kind} slot is open.`,
      next: nextCall("talents", { do: "show" }),
      reason: "slot_locked",
    });
  return { index: picked.index, kind };
}

function slotKind(
  catalog: TalentsCatalog | undefined,
  typeId: number | undefined,
): string {
  if (typeId === undefined) return flagsKind(undefined);
  if (catalog === undefined) return `type ${typeId}`;
  const row = catalog.slotType(typeId);
  if (row === undefined) return `type ${typeId}`;
  return flagsKind(row.typeFlags);
}

function openedExcept(state: TalentsSnapshot, except: number): SlotOf[] {
  return state.slots.filter(
    (slot) => slot.unlocked !== false && slot.index !== except,
  );
}

const REFUSED_DETAIL: Record<string, string> = {
  busy: "the character is busy casting.",
  glyph_socket_locked: "that glyph slot is locked.",
  invalid_glyph: "that glyph does not fit that slot.",
  not_a_glyph: "that item is not a glyph.",
  slot_locked: "that glyph slot is locked.",
  unique_glyph: "that glyph is already in a slot.",
  wrong_slot_type: "that glyph does not fit that slot.",
};

type GlyphTarget = { index: number; kind: string; label: string };

function invalidNext(
  item: GlyphItem,
  state: TalentsSnapshot,
  target: GlyphTarget,
): string {
  const other = openedExcept(state, target.index)[0];
  return other === undefined
    ? nextCall("talents", { do: "show" })
    : nextCall("talents", {
        do: "glyph",
        item: item.label,
        slot: other.index + 1,
      });
}

function glyphOutcome(
  outcome: ApplyGlyph,
  found: { item: GlyphItem; state: TalentsSnapshot; target: GlyphTarget },
  after: TalentsAfter,
): ToolResult<TalentsAfter> {
  const at = `${found.target.kind} slot ${found.target.index + 1}`;
  if (outcome.outcome === "applied") {
    const detail = `${found.item.label} in ${at}.`;
    return result("DONE", { after, body: [detail], detail });
  }
  if (outcome.outcome === "no_reply")
    return result("UNCONFIRMED", {
      after,
      body: [`${found.item.label} may still reach ${at}.`],
      detail: "the server did not answer the glyph request.",
      next: nextCall("talents", { do: "show" }),
      reason: "no_reply",
    });
  if (outcome.outcome === "failed")
    return result("REFUSED", {
      after,
      body: [`${found.item.label} was not put in ${at}.`],
      detail: `the glyph cast failed: ${outcome.reason}.`,
      next: nextCall("talents", { do: "show" }),
      reason: "failed",
    });
  if (outcome.outcome === "invalid_glyph")
    return result("REFUSED", {
      after,
      body: [`${found.item.label} does not fit ${at}.`],
      detail: REFUSED_DETAIL[outcome.outcome] as string,
      next: invalidNext(found.item, found.state, found.target),
      reason: outcome.outcome,
    });
  return result("REFUSED", {
    after,
    body: [`${found.item.label} was not put in ${at}.`],
    detail: REFUSED_DETAIL[outcome.outcome] ?? outcome.outcome,
    next: nextCall("talents", { do: "show" }),
    reason: outcome.outcome,
  });
}
export async function glyphTalents(
  ctx: TalentsCtx,
  item: string,
  slot: string | number,
): Promise<ToolResult<TalentsAfter>> {
  const { handle } = ctx;
  const found = findGlyphItem(ctx, item);
  const state = handle.talents.state();
  const catalog = asCatalog(
    await abortable(handle.talents.act.catalog(), ctx.signal),
  );
  const picked = glyphSlotOf(catalog, state, slot);
  ctx.signal.throwIfAborted();
  const outcome: ApplyGlyph = await ctx.rt.mutex.run(() =>
    abortable(
      handle.talents.act.applyGlyph({
        bag: found.bag,
        glyphSlot: picked.index,
        slot: found.slot,
      }),
      ctx.signal,
    ),
  );
  return glyphOutcome(
    outcome,
    { item: found, state, target: { ...picked, label: found.label } },
    { do: "glyph", freePoints: undefined, learned: 0 },
  );
}

export async function unglyphTalents(
  ctx: TalentsCtx,
  slot: unknown,
): Promise<ToolResult<TalentsAfter>> {
  const index = unglyphSlotOf(slot);
  const { handle } = ctx;
  const snapshot = handle.talents.state();
  const catalog = asCatalog(
    await abortable(handle.talents.act.catalog(), ctx.signal),
  );
  const kind = slotKind(catalog, snapshot.slots[index]?.typeId);
  ctx.signal.throwIfAborted();
  const outcome: RemoveGlyph = await ctx.rt.mutex.run(() =>
    abortable(handle.talents.act.removeGlyph(index), ctx.signal),
  );
  const after: TalentsAfter = {
    do: "unglyph",
    freePoints: undefined,
    learned: 0,
  };
  const at = `${kind} slot ${index + 1}`;
  if (outcome.outcome === "removed") {
    const detail = `glyph ${snapshot.slots[index]?.glyphId ?? 0} cleared from ${at}.`;
    return result("DONE", { after, body: [detail], detail });
  }
  if (outcome.outcome === "no_reply")
    return result("UNCONFIRMED", {
      after,
      body: [`${at} may still clear.`],
      detail: "the server did not answer the unglyph request.",
      next: nextCall("talents", { do: "show" }),
      reason: "no_reply",
    });
  return result("REFUSED", {
    after,
    body: [`${at} holds no glyph.`],
    detail: `glyph slot ${index + 1} is already empty.`,
    next: nextCall("talents", { do: "show" }),
    reason: "slot_empty",
  });
}
