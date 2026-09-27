import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

export type MovementDirection = "forward" | "backward" | "left" | "right";
export type MoveAxis = "forward" | "backward";
export type SideAxis = "left" | "right";

export type MovementInput = {
  readonly move?: MoveAxis;
  readonly strafe?: SideAxis;
  readonly turn?: SideAxis;
};

export type InputStep = { opcode: number; input: MovementInput };

export const TURN_BITS = MovementFlag.LEFT | MovementFlag.RIGHT;

export const INPUT_BITS =
  MovementFlag.FORWARD |
  MovementFlag.BACKWARD |
  MovementFlag.STRAFE_LEFT |
  MovementFlag.STRAFE_RIGHT |
  TURN_BITS;

export const DEFAULT_TURN_RATE = Math.PI;

const MOVE_FLAG: Record<MoveAxis, number> = {
  forward: MovementFlag.FORWARD,
  backward: MovementFlag.BACKWARD,
};

const STRAFE_FLAG: Record<SideAxis, number> = {
  left: MovementFlag.STRAFE_LEFT,
  right: MovementFlag.STRAFE_RIGHT,
};

const TURN_FLAG: Record<SideAxis, number> = {
  left: MovementFlag.LEFT,
  right: MovementFlag.RIGHT,
};

const MOVE_START: Record<MoveAxis, number> = {
  forward: GameOpcode.MSG_MOVE_START_FORWARD,
  backward: GameOpcode.MSG_MOVE_START_BACKWARD,
};

const STRAFE_START: Record<SideAxis, number> = {
  left: GameOpcode.MSG_MOVE_START_STRAFE_LEFT,
  right: GameOpcode.MSG_MOVE_START_STRAFE_RIGHT,
};

const TURN_START: Record<SideAxis, number> = {
  left: GameOpcode.MSG_MOVE_START_TURN_LEFT,
  right: GameOpcode.MSG_MOVE_START_TURN_RIGHT,
};

const SIDE_SIGN: Record<SideAxis, number> = { left: 1, right: -1 };

export function inputOf(direction: MovementDirection): MovementInput {
  if (direction === "forward" || direction === "backward")
    return { move: direction };
  return { strafe: direction };
}

export function assertInput(input: MovementInput): void {
  const { move, strafe, turn } = input;
  const valid =
    (move === undefined || move in MOVE_FLAG) &&
    (strafe === undefined || strafe in STRAFE_FLAG) &&
    (turn === undefined || turn in TURN_FLAG);
  if (!valid) throw new Error("invalid_direction");
}

export function isIdle(input: MovementInput): boolean {
  return !(input.move || input.strafe || input.turn);
}

export function sameInput(a: MovementInput, b: MovementInput): boolean {
  return a.move === b.move && a.strafe === b.strafe && a.turn === b.turn;
}

export function inputFlags({ move, strafe, turn }: MovementInput): number {
  return (
    (move ? MOVE_FLAG[move] : 0) |
    (strafe ? STRAFE_FLAG[strafe] : 0) |
    (turn ? TURN_FLAG[turn] : 0)
  );
}

export function translationHeading({
  move,
  strafe,
}: MovementInput): number | undefined {
  const side = strafe ? SIDE_SIGN[strafe] : 0;
  if (!move) return strafe ? (side * Math.PI) / 2 : undefined;
  const base = move === "forward" ? 0 : Math.PI;
  const lean = move === "forward" ? side : -side;
  return base + (lean * Math.PI) / 4;
}

export function turnSign({ turn }: MovementInput): number {
  return turn ? SIDE_SIGN[turn] : 0;
}

export function inputSteps(
  from: MovementInput,
  to: MovementInput,
): InputStep[] {
  const steps: InputStep[] = [];
  let input = from;
  if (from.move !== to.move) {
    input = { ...input, move: to.move };
    const opcode = to.move ? MOVE_START[to.move] : GameOpcode.MSG_MOVE_STOP;
    steps.push({ opcode, input });
  }
  if (from.strafe !== to.strafe) {
    input = { ...input, strafe: to.strafe };
    const opcode = to.strafe
      ? STRAFE_START[to.strafe]
      : GameOpcode.MSG_MOVE_STOP_STRAFE;
    steps.push({ opcode, input });
  }
  if (from.turn !== to.turn) {
    input = { ...input, turn: to.turn };
    const opcode = to.turn
      ? TURN_START[to.turn]
      : GameOpcode.MSG_MOVE_STOP_TURN;
    steps.push({ opcode, input });
  }
  return steps;
}
