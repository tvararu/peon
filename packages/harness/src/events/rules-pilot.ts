import type { Drafts, PoseMemo, RuleInput } from "#harness/events/rules";
import { poseMemo } from "#harness/events/rules-world";
import type { PilotObjective } from "#harness/loops/pilot-types";
import type { TacticsEvent } from "#harness/loops/tactics";

export type PilotTally = {
  runId: string;
  at: number;
  objective: PilotObjective;
  start: PoseMemo;
  calls: number;
  decisions: number;
  jumps: number;
  walkedYd: number;
  last: PoseMemo;
};

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function startedText(objective: PilotObjective): string {
  if (objective.kind === "reach")
    return `Pilot started: reach ${tenth(objective.x)}, ${tenth(objective.y)}.`;
  return `Pilot started: circle ${tenth(objective.x)}, ${tenth(objective.y)} r${tenth(objective.radius)} ${objective.direction}.`;
}

function pilotObjectiveOf(
  value: PilotObjective | undefined,
): PilotObjective | undefined {
  if (value === undefined) return undefined;
  if (value.kind === "reach") return { kind: "reach", x: value.x, y: value.y };
  return {
    direction: value.direction,
    kind: "circle",
    radius: value.radius,
    x: value.x,
    y: value.y,
  };
}

function moveYd(from: PoseMemo, to: PoseMemo): number {
  return tenth(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
}

function startedDraft(
  runId: string,
  objective: PilotObjective,
  pose: PoseMemo | undefined,
): Drafts {
  const data = {
    objective:
      objective.kind === "reach"
        ? { kind: "reach", x: objective.x, y: objective.y }
        : {
            direction: objective.direction,
            kind: "circle",
            radius: objective.radius,
            x: objective.x,
            y: objective.y,
          },
    runId,
    x: pose?.x,
    y: pose?.y,
    z: pose?.z,
  };
  return [
    {
      class: "log",
      data,
      domain: "pilot",
      event: "pilot/started",
      runId,
      text: startedText(objective),
    },
  ];
}

type DecisionInput = {
  runId: string;
  call: number;
  actionId: string;
  pose: PoseMemo | undefined;
  airborne: boolean;
};

function decisionDraft({
  actionId,
  airborne,
  call,
  pose,
  runId,
}: DecisionInput): Drafts {
  const data = {
    action: actionId,
    airborne,
    call,
    runId,
    x: pose?.x,
    y: pose?.y,
    z: pose?.z,
  };
  const at =
    pose === undefined
      ? "an unknown position"
      : `${tenth(pose.x)}, ${tenth(pose.y)}`;
  return [
    {
      class: "log",
      data,
      domain: "pilot",
      event: "pilot/decision",
      runId,
      text: `Pilot decision #${call}: ${actionId} at ${at}.`,
    },
  ];
}

function endedDraft(
  tally: PilotTally | undefined,
  runId: string,
  status: "completed" | "stopped" | "failed",
  reason: string,
): Drafts {
  const data = {
    decisions: tally?.decisions ?? 0,
    jumps: tally?.jumps ?? 0,
    reason,
    runId,
    status,
    walkedYd: tenth(tally?.walkedYd ?? 0),
  };
  return [
    {
      class: "log",
      data,
      domain: "pilot",
      event: "pilot/ended",
      runId,
      text: `Pilot ended: ${status} (${reason}) after ${data.decisions} decisions.`,
    },
  ];
}

type PilotStartInput = {
  rc: RuleInput;
  runId: string;
  objective: PilotObjective;
  start: PoseMemo;
  tallies: Map<string, PilotTally>;
};

export function pilotStarted({
  objective,
  rc,
  runId,
  start,
  tallies,
}: PilotStartInput): Drafts {
  tallies.set(runId, {
    at: rc.now,
    calls: 0,
    decisions: 0,
    jumps: 0,
    last: start,
    objective,
    runId,
    start,
    walkedYd: 0,
  });
  return startedDraft(runId, objective, start);
}

export type PilotDraftInput = {
  event: TacticsEvent;
  rc: RuleInput;
  pose: PoseMemo | undefined;
  airborne: boolean;
};

export function pilotDrafts(
  input: PilotDraftInput,
  tallies: Map<string, PilotTally>,
): Drafts {
  const { event } = input;
  if (event.type === "started") return startedPilotDraft(input, tallies);
  if (event.type === "applied") return appliedPilotDraft(input, tallies);
  if (event.type === "outcome") return outcomePilotDraft(event, tallies);
  if (event.type === "stopped") return stoppedPilotDraft(event, tallies);
  return [];
}

type StartedEvent = Extract<TacticsEvent, { type: "started" }> & {
  objective?: PilotObjective | undefined;
};
type AppliedEvent = Extract<TacticsEvent, { type: "applied" }>;
type OutcomeEvent = Extract<TacticsEvent, { type: "outcome" }>;
type StoppedEvent = Extract<TacticsEvent, { type: "stopped" }>;
type PilotStatus = "completed" | "stopped" | "failed";

function pilotStatusOf(status: string): PilotStatus {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "stopped";
}

function finishPilot(
  event: { runId: string },
  tallies: Map<string, PilotTally>,
  status: PilotStatus,
  reason: string,
): Drafts {
  const drafts = endedDraft(
    tallies.get(event.runId),
    event.runId,
    status,
    reason,
  );
  tallies.delete(event.runId);
  return drafts;
}

function startedPilotDraft(
  { event, pose, rc }: PilotDraftInput,
  tallies: Map<string, PilotTally>,
): Drafts {
  const started = event as StartedEvent;
  const objective = pilotObjectiveOf(started.objective);
  if (!(objective && pose)) return [];
  return pilotStarted({
    objective,
    rc,
    runId: started.runId,
    start: pose,
    tallies,
  });
}

function appliedPilotDraft(
  { airborne, event, pose, rc }: PilotDraftInput,
  tallies: Map<string, PilotTally>,
): Drafts {
  const applied = event as AppliedEvent;
  const tally = tallies.get(applied.runId);
  if (tally && pose) {
    tally.calls = Math.max(tally.calls, applied.call);
    tally.decisions += 1;
    if (applied.actionId === "jump_ahead") tally.jumps += 1;
    tally.walkedYd += moveYd(tally.last, pose);
    tally.last = pose;
    tally.at = rc.now;
  }
  return decisionDraft({
    actionId: applied.actionId,
    airborne,
    call: applied.call,
    pose,
    runId: applied.runId,
  });
}

function outcomePilotDraft(
  event: OutcomeEvent,
  tallies: Map<string, PilotTally>,
): Drafts {
  return finishPilot(event, tallies, pilotStatusOf(event.status), event.reason);
}

function stoppedPilotDraft(
  event: StoppedEvent,
  tallies: Map<string, PilotTally>,
): Drafts {
  if (!tallies.has(event.runId)) return [];
  const outcome = event.state.lastOutcome;
  const reason = outcome?.reason ?? event.reason;
  if (!outcome) {
    const status = event.reason.startsWith("self_") ? "failed" : "stopped";
    return finishPilot(event, tallies, status, reason);
  }
  return finishPilot(event, tallies, pilotStatusOf(outcome.status), reason);
}

export function poseOf(
  pose: Parameters<typeof poseMemo>[0],
): PoseMemo | undefined {
  return poseMemo(pose);
}
