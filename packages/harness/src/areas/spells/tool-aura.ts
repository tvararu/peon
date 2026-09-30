import type { CombatAura } from "@peon/core";
import {
  knownSpell,
  type SpellRef,
  spellName,
  wholeNumber,
} from "#harness/areas/spells/book";
import type {
  SpellAfter,
  SpellArgs,
  SpellCtx,
} from "#harness/areas/spells/tool";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import type { Game } from "#harness/loops/game";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const GONE_WITHIN_MS = 2000;
const AFLAG_NEGATIVE = 0x80;
const SPELL_ATTR0_PASSIVE = 0x40;
const SPELL_ATTR0_NO_AURA_CANCEL = 0x80_00_00_00;

const REASON_TEXT: Record<string, string> = {
  cancel_requested: "a cancel of this channel is already on its way.",
  invalid_spell: "that is not a spell id.",
  not_aura: "you do not wear that aura.",
  not_cancellable:
    "the server does not let you cancel this aura. Harmful and passive auras cannot be cancelled.",
  not_channelling: "you are not channelling that spell.",
};

const UINT32 = 2 ** 32;

function hasBit(bits: number | undefined, mask: number): boolean {
  const value = bits ?? 0;
  const unsigned = value < 0 ? value + UINT32 : value;
  return Math.floor(unsigned / mask) % 2 === 1;
}

export function isCancellable(handle: Game, aura: CombatAura): boolean {
  const attributes = handle.spellDefinition(aura.spellId)?.attributes;
  return !(
    hasBit(aura.flags, AFLAG_NEGATIVE) ||
    hasBit(attributes?.raw, SPELL_ATTR0_PASSIVE) ||
    hasBit(attributes?.raw, SPELL_ATTR0_NO_AURA_CANCEL)
  );
}

export function auraName(handle: Game, aura: CombatAura): string {
  return aura.name ?? spellName(handle, aura.spellId);
}

async function auraSpell(ctx: SpellCtx, text: string): Promise<SpellRef> {
  const { handle } = ctx;
  const id = wholeNumber(text);
  if (id !== undefined) return { id, name: spellName(handle, id) };
  const wanted = text.trim().toLowerCase();
  const worn = handle
    .getCombatState()
    .auras.find((aura) => auraName(handle, aura).toLowerCase() === wanted);
  if (worn) return { id: worn.spellId, name: auraName(handle, worn) };
  const spell = await knownSpell(handle, text);
  if (spell) return spell;
  throw new Refusal({
    detail: `you wear no aura and know no spell "${text.trim()}".`,
    next: nextCall("journal", { about: "spells" }),
    reason: "unknown_spell",
  });
}

function refusalOf(reason: string, spell: SpellRef): Refusal {
  const text = REASON_TEXT[reason] ?? `the server would ignore it (${reason}).`;
  return new Refusal({
    detail: `${spell.name} cannot be cancelled: ${text}`,
    next: nextCall("journal", { about: "spells" }),
    reason,
  });
}

function gone(event: Heard, handle: Game, spellId: number): boolean {
  if ("area" in event)
    return (
      event.area === "spells" &&
      event.event.type === "channel_end" &&
      event.event.spellId === spellId
    );
  return (
    event.type === "aura" &&
    !handle.getCombatState().auras.some((aura) => aura.spellId === spellId)
  );
}

export async function cancelAuraFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const { handle, rt, signal } = ctx;
  if (args.spell === undefined || args.spell.trim() === "")
    throw new Refusal({
      detail: "name the aura to cancel.",
      next: nextCall("journal", { about: "spells" }),
      reason: "missing_spell",
    });
  const spell = await auraSpell(ctx, args.spell);
  const after: SpellAfter = {
    do: "cancel_aura",
    slot: undefined,
    spell,
    target: undefined,
  };
  const removed = await settle<Heard>({
    match: (event) => gone(event, handle, spell.id),
    send: () =>
      rt.mutex.run(() => {
        const outcome = handle.spells.act.cancelAura(spell.id);
        if (!outcome.ok) throw refusalOf(outcome.reason, spell);
      }),
    signal,
    subscribe: hearCasts(handle),
    timeoutMs: GONE_WITHIN_MS,
  });
  if (removed)
    return result("DONE", { after, detail: `Cancelled ${spell.name}.` });
  return result("UNCONFIRMED", {
    after,
    detail: `${spell.name} was still on 2 s after the cancel. The server refuses some cancels in silence.`,
    next: nextCall("journal", { about: "spells" }),
    reason: "no_reply",
  });
}
