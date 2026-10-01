import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { GlyphEntry, TalentCatalog } from "#wow/areas/talents/catalog";
import { buildRemoveGlyph, MAX_GLYPH_SLOT } from "#wow/areas/talents/protocol";
import type { TalentsEvent, TalentsStore } from "#wow/areas/talents/store";
import { readInventory } from "#wow/inventory";
import type { ItemTemplate } from "#wow/protocol/item";
import { ItemSpellTrigger } from "#wow/protocol/item";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";
import type { SpellDefinition } from "#wow/spell-catalog";

export const GLYPH_ANSWER_MS = 5000;
const APPLY_GLYPH_EFFECT = 74;

export type GlyphApplyRequest = {
  bag: number;
  slot: number;
  glyphSlot: number;
};

export type GlyphApplyResult =
  | { outcome: "applied"; glyphId: number }
  | { outcome: "slot_locked" }
  | { outcome: "not_a_glyph" }
  | { outcome: "wrong_slot_type" }
  | { outcome: "glyph_socket_locked" }
  | { outcome: "invalid_glyph" }
  | { outcome: "unique_glyph" }
  | { outcome: "busy" }
  | { outcome: "failed"; reason: string }
  | { outcome: "no_reply" };

export type GlyphRemoveResult =
  | { outcome: "removed" }
  | { outcome: "slot_empty" }
  | { outcome: "no_reply" };

export type GlyphActs = {
  applyGlyph: (request: GlyphApplyRequest) => Promise<GlyphApplyResult>;
  removeGlyph: (slot: number) => Promise<GlyphRemoveResult>;
};

export type GlyphEnv = {
  ctx: AreaRuntimeCtx<TalentsEvent>;
  store: TalentsStore;
  core: CoreStores;
  catalog: () => Promise<TalentCatalog | undefined>;
};

function validSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= MAX_GLYPH_SLOT;
}

function enabledAt(mask: number | undefined, index: number): boolean {
  if (mask === undefined) return true;
  return (mask & (1 << index)) !== 0;
}

function useSpellOf(template: ItemTemplate | undefined): number | undefined {
  return template?.spells.find(
    (spell) => spell.trigger === ItemSpellTrigger.ON_USE,
  )?.id;
}

function glyphOf(definition: SpellDefinition | undefined): number | undefined {
  return definition?.effects.find(
    (entry) => entry.effect === APPLY_GLYPH_EFFECT,
  )?.miscValue;
}

function findCarried(
  env: GlyphEnv,
  bag: number,
  slot: number,
): { entry: number; guid: bigint } | undefined {
  const inventory = readInventory(env.ctx.selfGuid(), (guid) =>
    env.store.entityOf(guid),
  );
  for (const candidate of inventory.slots) {
    if (
      candidate.status === "occupied" &&
      candidate.bag === bag &&
      candidate.slot === slot
    )
      return { entry: candidate.item.entry ?? 0, guid: candidate.guid };
  }
  return undefined;
}

function checkTypes(
  catalog: TalentCatalog | undefined,
  glyph: GlyphEntry,
  slotType: number | undefined,
): GlyphApplyResult | undefined {
  if (!catalog) return undefined;
  if (slotType === undefined) return { outcome: "wrong_slot_type" };
  const wanted = catalog.slotType(slotType);
  if (!wanted || wanted.typeFlags !== glyph.typeFlags)
    return { outcome: "wrong_slot_type" };
  return undefined;
}

function resolveFailure(reason: string | undefined): GlyphApplyResult {
  if (reason === "invalid_glyph") return { outcome: "invalid_glyph" };
  if (reason === "glyph_socket_locked")
    return { outcome: "glyph_socket_locked" };
  if (reason === "unique_glyph") return { outcome: "unique_glyph" };
  return { outcome: "failed", reason: reason ?? "unknown" };
}

type PendingApply = {
  spellId: number;
  glyphId: number;
  glyphSlot: number;
  item: { bag: number; slot: number; guid: bigint; entry: number };
};

async function sendApply(
  env: GlyphEnv,
  apply: PendingApply,
): Promise<GlyphApplyResult> {
  const { spellId, glyphId, glyphSlot } = apply;
  const scope = new AbortController();
  const signal = AbortSignal.any([env.ctx.signal, scope.signal]);
  const waited: Promise<TalentsEvent> = env.ctx.until(
    (event) =>
      event.type === "info" &&
      event.glyphs.some(
        (change) => change.slot === glyphSlot && change.to === glyphId,
      ),
    { signal, timeoutMs: GLYPH_ANSWER_MS },
  );
  const gate = Promise.withResolvers<GlyphApplyResult>();
  const stopListening = env.ctx.listen("combat", (event) => {
    if (event.type !== "cast_failed") return;
    const outcome = event.state.lastOutcome;
    if (outcome?.spellId !== spellId) return;
    gate.resolve(resolveFailure(outcome.reason));
  });
  const handled: Promise<GlyphApplyResult> = Promise.race([
    waited.then(
      (): GlyphApplyResult => ({ glyphId, outcome: "applied" }),
      (error: unknown) => {
        if (error instanceof Error && error.message === "timeout")
          return { outcome: "no_reply" } as GlyphApplyResult;
        throw error;
      },
    ),
    gate.promise,
  ]);
  try {
    env.ctx.signal.throwIfAborted();
    env.core.combat.casts.sendItem(env.ctx.send, spellId, {
      bag: apply.item.bag,
      entry: apply.item.entry,
      glyphIndex: glyphSlot,
      guid: apply.item.guid,
      slot: apply.item.slot,
    });
  } catch (error) {
    scope.abort();
    stopListening();
    gate.resolve({ outcome: "no_reply" });
    await handled.catch(() => undefined);
    if (
      error instanceof Error &&
      (error.message === "cast_in_progress" || error.message === "channelling")
    )
      return { outcome: "busy" };
    throw error;
  }
  try {
    return await handled;
  } finally {
    scope.abort();
    stopListening();
    gate.resolve({ outcome: "no_reply" });
    await handled.catch(() => undefined);
  }
}

export async function applyGlyph(
  env: GlyphEnv,
  request: GlyphApplyRequest,
): Promise<GlyphApplyResult> {
  if (!validSlot(request.glyphSlot)) throw new Error("bad_glyph_slot");
  const snapshot = env.store.snapshot();
  if (!enabledAt(snapshot.fields.enabledMask, request.glyphSlot))
    return { outcome: "slot_locked" };
  const item = findCarried(env, request.bag, request.slot);
  if (!item) throw new Error("no_item");
  const template = await env.core.items
    .lookup(item.entry)
    .catch(() => undefined);
  const spellId = useSpellOf(template);
  if (spellId === undefined) return { outcome: "not_a_glyph" };
  const glyphId = glyphOf(env.core.combat.definition(spellId));
  if (glyphId === undefined) return { outcome: "not_a_glyph" };
  const catalog = await env.catalog();
  const glyph = catalog?.glyph(glyphId);
  if (catalog && !glyph) return { outcome: "not_a_glyph" };
  if (glyph) {
    const refused = checkTypes(
      catalog,
      glyph,
      snapshot.slots[request.glyphSlot]?.typeId,
    );
    if (refused) return refused;
  }
  return sendApply(env, {
    glyphId,
    glyphSlot: request.glyphSlot,
    item: {
      bag: request.bag,
      entry: item.entry,
      guid: item.guid,
      slot: request.slot,
    },
    spellId,
  });
}

export function removeGlyph(
  env: GlyphEnv,
  slot: number,
): Promise<GlyphRemoveResult> {
  if (!validSlot(slot)) return Promise.resolve({ outcome: "slot_empty" });
  const filled = env.store.snapshot().slots[slot]?.glyphId;
  if (filled === undefined || filled === 0)
    return Promise.resolve({ outcome: "slot_empty" });
  const scope = new AbortController();
  const waited = env.ctx.until(
    (event) =>
      event.type === "info" &&
      event.glyphs.some((change) => change.slot === slot && change.to === 0),
    {
      signal: AbortSignal.any([env.ctx.signal, scope.signal]),
      timeoutMs: GLYPH_ANSWER_MS,
    },
  );
  const handled: Promise<GlyphRemoveResult> = waited.then(
    () => ({ outcome: "removed" }) as const,
    (error: unknown) => {
      if (error instanceof Error && error.message === "timeout")
        return { outcome: "no_reply" } as const;
      throw error;
    },
  );
  try {
    env.ctx.signal.throwIfAborted();
    env.ctx.send(GameOpcode.CMSG_REMOVE_GLYPH, buildRemoveGlyph(slot));
  } catch (error) {
    scope.abort();
    return handled.catch(() => {
      throw error;
    });
  }
  return handled;
}
