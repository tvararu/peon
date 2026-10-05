import type {
  CombatState,
  EntityLookup,
  GroundOracle,
  NearbyRow,
  SpellDefinition,
} from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import {
  ClosingTracker,
  impairments,
  meleeReachYd,
  moveGoalText,
  reachText,
} from "#harness/loops/combat-actions-kite";
import { separation } from "#harness/loops/combat-actions-observation";
import { PILOT_DEADMAN_MS } from "#harness/loops/pilot-actions";
import { type PilotPose, poseOf } from "#harness/loops/pilot-geometry";
import {
  buildOptions,
  type PilotOption,
  scanCache,
} from "#harness/loops/pilot-options";
import {
  aggroCircles,
  buildPilotUnits,
  PILOT_UNIT_LIMIT,
  unitLines,
} from "#harness/loops/pilot-units";
import type { ControlPort } from "#harness/loops/ports";

export type MoveDeps = {
  control: ControlPort;
  entity: EntityLookup;
  definition: (spellId: number) => SpellDefinition | undefined;
  now: () => number;
  ground?: GroundOracle;
  nearby?: () => readonly NearbyRow[];
  aggro?: (guid: bigint) => boolean;
};

export type MoveFrame = {
  facts: Record<string, unknown>;
  candidates: JevCandidate[];
};

export class CombatMoves {
  private readonly deps: MoveDeps;
  private readonly closing = new ClosingTracker();
  private options: PilotOption[] = [];

  constructor(deps: MoveDeps) {
    this.deps = deps;
  }

  reset(): void {
    this.closing.reset();
    this.options = [];
  }

  observe(
    state: CombatState,
    targetGuid: bigint,
    offerMoves: boolean,
  ): MoveFrame {
    const { control, entity } = this.deps;
    const distance = separation(state);
    this.closing.record({
      at: this.deps.now(),
      guid: targetGuid,
      yd: distance,
    });
    const reachYd = meleeReachYd(entity(state.self.guid), entity(targetGuid));
    const name = state.target?.name ?? "The target";
    const held = control.snapshot();
    const pilotPose = held.pose
      ? poseOf(held.pose, held.speed, held.airborne)
      : undefined;
    const units = this.dangerUnits(state, targetGuid, pilotPose);
    const facts: Record<string, unknown> = {
      targetImpaired: impairments(state.targetAuras, this.deps.definition),
      targetReach:
        distance === undefined
          ? null
          : reachText({
              closingYdPerS: this.closing.speedYdPerS(),
              distanceYd: distance,
              name,
              reachYd,
            }),
      units: pilotPose
        ? unitLines(units.slice(0, PILOT_UNIT_LIMIT), pilotPose)
        : [],
    };
    this.options = [];
    if (!(offerMoves && pilotPose)) return { candidates: [], facts };
    const targetPose = state.target?.pose;
    const target = targetPose ?? pilotPose;
    this.options = buildOptions({
      cache: scanCache(this.deps.ground, pilotPose),
      circles: aggroCircles(units),
      goalText: moveGoalText({
        name,
        pose: pilotPose,
        reachYd,
        target: targetPose,
      }),
      ground: this.deps.ground,
      jumps: false,
      objective: { kind: "reach", x: target.x, y: target.y },
      pose: pilotPose,
    });
    return {
      candidates: this.options.map(({ id, description }) => ({
        description,
        id,
      })),
      facts,
    };
  }

  run(id: string): boolean {
    const option = this.options.find((candidate) => candidate.id === id);
    if (!option) return false;
    if (option.input === undefined) {
      this.deps.control.halt();
      return true;
    }
    this.deps.control.face(option.heading);
    this.deps.control.drive(option.input, PILOT_DEADMAN_MS);
    return true;
  }

  private dangerUnits(
    state: CombatState,
    targetGuid: bigint,
    pose: PilotPose | undefined,
  ) {
    if (!pose) return [];
    const fighting = new Set([targetGuid, ...state.attackers]);
    return buildPilotUnits(this.deps.nearby?.() ?? [], pose, this.deps.aggro)
      .filter((unit) => !fighting.has(unit.guid))
      .filter((unit) => unit.state !== "attacking you");
  }
}
