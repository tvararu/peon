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

export type PilotContext = TacticsBase & { objective: PilotObjective };

export function pilotInstruction(objective: PilotObjective): string {
  if (objective.kind === "reach")
    return "reach the goal point and keep moving until it is done; never stand still unless the objective is done";
  return "run one lap of the circle and keep moving until it is done; never stand still unless the objective is done";
}
