import type { PacketReader } from "#wow/protocol/packet";

export const ACTION_BUTTON_SLOTS = 144;

export type ActionButtonType = "spell" | "item" | "macro" | "equipment_set";

export type ActionButton = {
  slot: number;
  type: ActionButtonType;
  id: number;
};

export type ActionButtons =
  | { behavior: "clear" }
  | { behavior: "initial" | "set"; buttons: ActionButton[] };

const TYPE_BY_CODE: Record<number, ActionButtonType> = {
  0: "spell",
  32: "equipment_set",
  64: "macro",
  65: "macro",
  128: "item",
};

const BEHAVIORS = ["initial", "set", "clear"] as const;

export function parseActionButtons(r: PacketReader): ActionButtons {
  const behavior = BEHAVIORS[r.uint8()];
  if (!behavior) throw new Error("invalid_action_bar_behavior");
  if (behavior === "clear") return { behavior };
  const buttons: ActionButton[] = [];
  for (let slot = 0; slot < ACTION_BUTTON_SLOTS; slot++) {
    const packed = r.uint32LE();
    const type = TYPE_BY_CODE[packed >>> 24];
    if (packed === 0 || !type) continue;
    buttons.push({ slot, type, id: packed & 0x00_ff_ff_ff });
  }
  return { behavior, buttons };
}
