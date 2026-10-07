import type { TacticsBase } from "#harness/loops/tactics";

export type PilotObjective =
  | { kind: "reach"; x: number; y: number }
  | {
      kind: "circle";
      x: number;
      y: number;
      radius: number;
      direction: "clockwise" | "counterclockwise";
    };

export type FoeGoal = { kind: "foe"; x: number; y: number };

export type OptionGoal = PilotObjective | FoeGoal;

export type PilotContext = TacticsBase<PilotObjective> & {
  objective: PilotObjective;
};

export function pilotInstruction(objective: PilotObjective): string {
  if (objective.kind === "reach")
    return "get to the goal point: keep moving and pick the clear option that leaves the goal closest to straight ahead; the units list gives inferred aggro ranges, stay outside them by going around a range rather than through it even when the way is longer; go around anything in the way; stop only when the goal is reached";
  return "run one lap of the circle by chasing the next lap point: keep moving and pick the clear option that leaves the next lap point closest to straight ahead; the units list gives inferred aggro ranges, stay outside them by going around a range rather than through it even when the way is longer; stop only when the lap is done";
}
