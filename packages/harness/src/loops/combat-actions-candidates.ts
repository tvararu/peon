import { type CombatState, type EntityLookup, isUnit } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import type { ActionDeps } from "#harness/loops/combat-actions-frame";
import {
  type KiteWatch,
  kiteMasked,
  kiteSpellSuffix,
} from "#harness/loops/combat-actions-kite";
import {
  type CombatMovesInput,
  combatMoveCandidates,
} from "#harness/loops/combat-actions-moves";
import { facing, separation } from "#harness/loops/combat-actions-observation";
import { petCandidate, petOf } from "#harness/loops/combat-actions-pet";
import { describeSpell } from "#harness/loops/combat-actions-spells";
import type { RejectionTracker } from "#harness/loops/combat-rejections";
import type { TacticsContext } from "#harness/loops/tactics";

export type CandidateSpell = {
  spell?: Parameters<typeof describeSpell>[0] | undefined;
  target: bigint;
  id: string;
  reason?: string;
  supported: boolean;
};

export type CandidatesInput = {
  candidates: JevCandidate[];
  spells: readonly CandidateSpell[];
  state: CombatState;
  context: TacticsContext;
  kite: boolean;
};

export type CandidatesScope = {
  deps: ActionDeps;
  watch: KiteWatch;
  gap: number | undefined;
  rejections: RejectionTracker;
};

export function addCandidates(
  scope: CandidatesScope,
  input: CandidatesInput,
): void {
  const { candidates, context, kite, spells, state } = input;
  if (state.target?.health === 0) return;
  if (state.casting?.cancelRequested || state.pendingCast?.cancelRequested)
    return;
  if (state.casting || state.pendingCast) {
    candidates.push({
      id: "cancel",
      description: "Request cancellation of the current cast",
    });
    return;
  }
  if (scope.deps.control.snapshot().movementAllowed)
    candidates.push(
      ...combatMoveCandidates({
        context,
        deps: scope.deps,
        masked: (id: string) => kiteMasked(scope.watch, id),
        previousGap: scope.gap,
        spells,
        state,
      } satisfies CombatMovesInput),
    );
  for (const action of spells)
    if (action.spell && !action.reason)
      candidates.push({
        id: action.id,
        description:
          describeSpell(action.spell, action.target === state.self.guid) +
          kiteSpellSuffix(action.spell, kite),
      });
  addEngageCandidates(scope, candidates, state);
}

function addEngageCandidates(
  scope: CandidatesScope,
  candidates: JevCandidate[],
  state: CombatState,
): void {
  const pet = petCandidate(
    petOf(scope.deps.entity, state.self.guid),
    state,
    scope.deps.now(),
  );
  if (pet) candidates.push(pet);
  if (state.autoRepeat)
    candidates.push({ id: "stop_auto_shot", description: "Stop Auto Shot" });
  if (state.attacking || state.pendingAttack)
    candidates.push({ id: "stop_attack", description: "Stop autoattack" });
  else if (inMelee(scope.deps.entity, state) && facing(state))
    candidates.push({
      id: "attack",
      description: "Start melee autoattack against the selected creature",
    });
  if (
    state.self.pose &&
    state.target?.pose &&
    (!facing(state) || scope.rejections.facingRejected()) &&
    scope.deps.control.snapshot().movementAllowed
  )
    candidates.push({
      id: "face_target",
      description: scope.rejections.facingRejected()
        ? "Turn to face the selected creature; the server rejected the last action because it was not in front"
        : "Turn to face the selected creature at its current observed or predicted position",
    });
}

export function canMelee(entity: EntityLookup, state: CombatState): boolean {
  return isUnit(entity(state.self.guid));
}

export function inMelee(entity: EntityLookup, state: CombatState): boolean {
  const self = entity(state.self.guid);
  const target = state.target && entity(state.target.guid);
  const a = isUnit(self) ? self.combatReach : undefined;
  const b = isUnit(target) ? target.combatReach : undefined;
  const distance = separation(state);
  if (a === undefined || b === undefined || distance === undefined)
    return false;
  return distance <= Math.max(5, a + b + 4 / 3);
}
