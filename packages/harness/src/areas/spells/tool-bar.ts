import type { ActionButton } from "@peon/core";
import { spellName, wholeNumber } from "#harness/areas/spells/book";
import type {
  SpellAfter,
  SpellArgs,
  SpellCtx,
} from "#harness/areas/spells/tool";
import { spellOf } from "#harness/areas/spells/tool-cast";
import type { BarLine } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { Game } from "#harness/loops/game";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const BAR_SLOTS = 144;

type Button = Omit<ActionButton, "slot">;

const MACRO_TEXT: Record<string, string> = {
  equipment_set: "set",
  macro: "macro",
};

export function barLines(handle: Game): BarLine[] {
  return handle.getActionBar().map((button) => ({
    id: button.id,
    name: buttonName(handle, button),
    slot: button.slot + 1,
    type: button.type,
  }));
}

function buttonName(handle: Game, button: ActionButton): string {
  if (button.type === "spell") return spellName(handle, button.id);
  if (button.type === "item")
    return handle.itemLabel(button.id).name ?? `item ${button.id}`;
  return `${MACRO_TEXT[button.type] ?? button.type} ${button.id}`;
}

export function barText({ id, name, slot, type }: BarLine): string {
  const label = `${type} ${id}`;
  return name === label
    ? `slot ${slot}: ${name}`
    : `slot ${slot}: ${name} (${label})`;
}

function itemButton(ctx: SpellCtx, text: string): Button {
  const id = wholeNumber(text);
  if (id !== undefined) return { id, type: "item" };
  const wanted = text.trim().toLowerCase();
  const held = ctx.handle
    .getInventoryState()
    .slots.find(
      (slot) =>
        slot.status === "occupied" &&
        slot.item.name?.toLowerCase() === wanted &&
        slot.item.entry !== undefined,
    );
  const entry = held?.status === "occupied" ? held.item.entry : undefined;
  if (entry === undefined)
    throw new Refusal({
      detail: `no item named "${text.trim()}" is in the bags.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "unknown_item",
    });
  return { id: entry, type: "item" };
}

async function buttonOf(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<Button | undefined> {
  const spellText = args.spell?.trim() ?? "";
  const itemText = args.item?.trim() ?? "";
  if (spellText !== "" && itemText !== "")
    throw new Refusal({
      detail: "put a spell or an item on a slot, not both.",
      reason: "spell_or_item",
    });
  if (spellText !== "") {
    const spell = await spellOf(ctx, spellText);
    return { id: spell.id, type: "spell" };
  }
  return itemText === "" ? undefined : itemButton(ctx, itemText);
}

function slotOf(args: SpellArgs): number {
  const { slot } = args;
  if (slot === undefined)
    throw new Refusal({
      detail: `name the action bar slot, 1 to ${BAR_SLOTS}.`,
      reason: "missing_slot",
    });
  if (!Number.isInteger(slot) || slot < 1 || slot > BAR_SLOTS)
    throw new Refusal({
      detail: `slot ${slot} does not exist; the bar has slots 1 to ${BAR_SLOTS}.`,
      reason: "invalid_slot",
    });
  return slot;
}

export async function barFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const { handle, rt } = ctx;
  const slot = slotOf(args);
  const button = await buttonOf(args, ctx);
  const sent = await rt.mutex.run(() =>
    handle.spells.act.setActionButton(slot - 1, button),
  );
  if (!sent.ok)
    throw new Refusal({
      detail: `slot ${slot} did not take the button: ${sent.reason}.`,
      next: nextCall("journal", { about: "spells" }),
      reason: sent.reason,
    });
  const row = barLines(handle).find((line) => line.slot === slot);
  const spell =
    button?.type === "spell"
      ? { id: button.id, name: spellName(handle, button.id) }
      : undefined;
  return result("DONE", {
    after: { do: "bar", slot, spell, target: undefined },
    body: [row ? barText(row) : `slot ${slot}: empty`],
    detail: button
      ? `Put ${row?.name ?? "the button"} on slot ${slot}.`
      : `Cleared slot ${slot}.`,
  });
}
