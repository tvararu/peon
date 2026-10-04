import { distance2d, normalizeAngle } from "@peon/core";
import type { PilotFrameDeps } from "#harness/loops/pilot-actions";
import {
  circleTangent,
  goalBearingText,
  relativeDeg,
} from "#harness/loops/pilot-geometry";
import { blockerText, scansForHeadings } from "#harness/loops/pilot-options";
import type { PilotObjective } from "#harness/loops/pilot-types";
import type { TacticsFrame } from "#harness/loops/tactics";

export type PilotMemory = {
  startPose: { x: number; y: number } | undefined;
  bearing: number | undefined;
  sweptRad: number;
  decisions: { actionId: string; movedYd: number }[];
};

export function freshMemory(): PilotMemory {
  return {
    bearing: undefined,
    decisions: [],
    startPose: undefined,
    sweptRad: 0,
  };
}

export function reachOutcome(
  objective: Extract<PilotObjective, { kind: "reach" }>,
  x: number,
  y: number,
  dead: boolean,
): TacticsFrame["outcome"] {
  if (dead) return { reason: "self_dead", status: "failed" };
  if (distance2d({ x, y }, objective) <= 1.5)
    return { reason: "goal_reached", status: "completed" };
  return undefined;
}

export type CircleOutcomeInput = {
  objective: Extract<PilotObjective, { kind: "circle" }>;
  memory: PilotMemory;
  x: number;
  y: number;
  dead: boolean;
};

export function circleOutcome({
  dead,
  memory,
  objective,
  x,
  y,
}: CircleOutcomeInput): TacticsFrame["outcome"] {
  if (dead) return { reason: "self_dead", status: "failed" };
  const bearing = Math.atan2(objective.y - y, objective.x - x);
  if (memory.startPose === undefined) {
    memory.startPose = { x, y };
    memory.bearing = bearing;
    return undefined;
  }
  const previous = memory.bearing ?? bearing;
  const delta = normalizeAngle(bearing - previous);
  const signed = delta > Math.PI ? delta - Math.PI * 2 : delta;
  const forward = objective.direction === "counterclockwise" ? signed : -signed;
  if (forward > 0) memory.sweptRad += forward;
  memory.bearing = bearing;
  const home =
    memory.startPose === undefined
      ? Number.POSITIVE_INFINITY
      : distance2d({ x, y }, memory.startPose);
  if (memory.sweptRad >= Math.PI * 2 && home <= 3)
    return { reason: "lap_completed", status: "completed" };
  return undefined;
}

export type ObjectiveTextInput = {
  objective: PilotObjective;
  memory: PilotMemory;
  x: number;
  y: number;
  facing: number;
};

export function objectiveText({
  facing,
  memory,
  objective,
  x,
  y,
}: ObjectiveTextInput): { detail: string; distanceYd: number } {
  if (objective.kind === "reach") {
    const distance = distance2d({ x, y }, objective);
    const bearing = Math.atan2(objective.y - y, objective.x - x);
    const rounded = Math.round(distance * 10) / 10;
    return {
      detail: `${rounded} yd ${goalBearingText(relativeDeg(bearing, facing))}`,
      distanceYd: rounded,
    };
  }
  const off =
    Math.round((distance2d({ x, y }, objective) - objective.radius) * 10) / 10;
  const tangent = circleTangent(objective, {
    airborne: false,
    mapId: 0,
    orientation: facing,
    speed: 0,
    x,
    y,
    z: 0,
  });
  const lap = Math.min(1, memory.sweptRad / (Math.PI * 2));
  return {
    detail: `${circlePositionText(off)}; the circle continues ${goalBearingText(relativeDeg(tangent, facing))}; lap ${Math.round(lap * 100)}% done`,
    distanceYd: Math.abs(off),
  };
}

function circlePositionText(off: number): string {
  if (off === 0) return "on the circle";
  if (off > 0) return `${off} yd outside the circle`;
  return `${-off} yd inside the circle`;
}

export function describeSelf(
  input: { move?: string; strafe?: string; turn?: string },
  airborne: boolean,
  speed: number,
  memory: PilotMemory,
): string {
  const keys = [input.move, input.strafe, input.turn].filter(
    (key) => key !== undefined,
  );
  const held = keys.length > 0 ? keys.join("+") : "none";
  const recent =
    memory.decisions.length === 0
      ? "no decisions yet"
      : memory.decisions
          .map((entry) => `${entry.actionId} moved ${entry.movedYd} yd`)
          .join("; ");
  return `holding ${held}; ${airborne ? "airborne" : "on the ground"}; speed ${Math.round(speed * 10) / 10} yd/s; last decisions: ${recent}`;
}

export function describeSurroundings(
  ground: PilotFrameDeps["ground"],
  pose: Parameters<typeof scansForHeadings>[1],
): string[] {
  return scansForHeadings(ground, pose).map((scan, index) => {
    const slots = [
      "ahead",
      "ahead-right",
      "right",
      "behind-right",
      "behind",
      "behind-left",
      "left",
      "ahead-left",
    ];
    return `${slots[index]}: clear ${scan.freeYd} yd, ${blockerText(scan)}`;
  });
}
