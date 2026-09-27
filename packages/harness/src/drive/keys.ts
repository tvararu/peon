import { isKeyRelease, isKeyRepeat, parseKey } from "@earendil-works/pi-tui";
import type { MovementInput } from "@peon/core";

export type KeyPhase = "press" | "repeat" | "release";
export type KeyEvent = { id: string; phase: KeyPhase };

export type MoveKey = "w" | "s" | "a" | "d" | "q" | "e";

export type PlayCommand =
  | { type: "hold"; key: MoveKey }
  | { type: "jump" }
  | { type: "next_target" }
  | { type: "slot"; slot: number }
  | { type: "interact" }
  | { type: "talk" }
  | { type: "hand_back" }
  | { type: "stop" }
  | { type: "pass" }
  | { type: "swallow" };

export const ENTER_KEYS: readonly string[] = ["f1", "ctrl+]"];
const STOP_KEYS: readonly string[] = ["f9", "ctrl+\\"];

const MOVE_KEYS: Record<string, MoveKey> = {
  a: "a",
  d: "d",
  down: "s",
  e: "e",
  left: "a",
  q: "q",
  right: "d",
  s: "s",
  up: "w",
  w: "w",
};

const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];

const PRESS: Record<string, PlayCommand> = {
  enter: { type: "talk" },
  escape: { type: "hand_back" },
  f: { type: "interact" },
  space: { type: "jump" },
  tab: { type: "next_target" },
};

const MODIFIED = /^(ctrl|alt|super)\+|^f\d+$/;
const UPPER = /^[A-Z]$/;
const SHIFTED = /^shift\+(?=.$)/;

export function readKey(data: string): KeyEvent | undefined {
  const parsed = parseKey(data);
  if (parsed === undefined) return undefined;
  const id = UPPER.test(parsed)
    ? parsed.toLowerCase()
    : parsed.replace(SHIFTED, "");
  if (isKeyRelease(data)) return { id, phase: "release" };
  return { id, phase: isKeyRepeat(data) ? "repeat" : "press" };
}

export function playCommand(id: string): PlayCommand {
  const move = MOVE_KEYS[id];
  if (move) return { key: move, type: "hold" };
  const slot = SLOT_KEYS.indexOf(id);
  if (slot >= 0) return { slot, type: "slot" };
  const press = PRESS[id];
  if (press) return press;
  if (STOP_KEYS.includes(id)) return { type: "stop" };
  return MODIFIED.test(id) ? { type: "pass" } : { type: "swallow" };
}

function axis<T extends string>(
  held: ReadonlySet<MoveKey>,
  [plus, minus]: readonly [MoveKey, MoveKey],
  [a, b]: readonly [T, T],
): T | undefined {
  if (held.has(plus) === held.has(minus)) return undefined;
  return held.has(plus) ? a : b;
}

export function inputOf(held: ReadonlySet<MoveKey>): MovementInput {
  const move = axis(held, ["w", "s"], ["forward", "backward"] as const);
  const turn = axis(held, ["a", "d"], ["left", "right"] as const);
  const strafe = axis(held, ["q", "e"], ["left", "right"] as const);
  return {
    ...(move && { move }),
    ...(strafe && { strafe }),
    ...(turn && { turn }),
  };
}

export function slotLabel(slot: number): string {
  return SLOT_KEYS[slot] ?? String(slot);
}
