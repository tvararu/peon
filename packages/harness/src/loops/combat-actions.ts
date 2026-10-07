import { bearing, type CombatState } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import {
  addCandidates,
  type CandidatesInput,
  canMelee,
  inMelee,
} from "#harness/loops/combat-actions-candidates";
import {
  channelCandidates,
  channelObservation,
} from "#harness/loops/combat-actions-channel";
import {
  deathOutcome,
  engagedWith,
} from "#harness/loops/combat-actions-credit";
import {
  type ActionDeps,
  baseObservation,
} from "#harness/loops/combat-actions-frame";
import {
  driveKiteMove,
  KITE_MOVE_REFUSALS,
  kiteHolding,
  kiteMasked,
  kiteMelee,
  kiteOf,
  kiteOffers,
  kiteWatch,
  longestHostileRange,
  maskPendingMove,
  movePlacement,
  resetKite,
  waitRenewal,
} from "#harness/loops/combat-actions-kite";
import { WAIT } from "#harness/loops/combat-actions-movement";
import {
  closingText,
  combatDangerText,
  combatMoveOption,
  snares,
  targetGap,
} from "#harness/loops/combat-actions-moves";
import {
  RANGE_HELD_REASONS,
  separation,
  timeoutOutcome,
  withNulls,
} from "#harness/loops/combat-actions-observation";
import { petOf } from "#harness/loops/combat-actions-pet";
import {
  type SpellAction,
  spellAction,
} from "#harness/loops/combat-actions-spell-assembly";
import { requiresStanding } from "#harness/loops/combat-actions-spells";
import { targetReason } from "#harness/loops/combat-actions-target";
import { approached, ProgressWatch } from "#harness/loops/combat-progress";
import { RejectionTracker } from "#harness/loops/combat-rejections";
import { PILOT_DEADMAN_MS } from "#harness/loops/pilot-actions";

import type { TacticsContext, TacticsFrame } from "#harness/loops/tactics";

const UNREACHABLE_TIMEOUT_MS = 5000;

export class CombatActions {
  private readonly deps: ActionDeps;
  private startedAt = 0;
  private deadAt: number | undefined;
  private engaged = false;
  private unreachable: { at: number; range: number | undefined } | undefined;
  private gap: number | undefined;
  private readonly progress = new ProgressWatch();
  private readonly rejections = new RejectionTracker();
  private readonly kite = kiteWatch({ now: () => this.deps.now() });

  constructor(deps: ActionDeps) {
    this.deps = deps;
  }

  activate(context: TacticsContext): void {
    const state = this.deps.combat.snapshot(context.targetGuid);
    const reason = targetReason(this.deps, context.targetGuid, state);
    if (reason) throw new Error(reason);
    this.startedAt = this.deps.now();
    this.deadAt = undefined;
    this.engaged = false;
    this.unreachable = undefined;
    this.gap = undefined;
    this.progress.reset();
    this.rejections.reset(this.startedAt);
    resetKite(this.kite);
    this.deps.control.halt();
    this.deps.combat.halt();
    this.deps.control.selectTarget(context.targetGuid);
  }

  commit(context: TacticsContext): TacticsFrame {
    return this.frame(context, false);
  }

  observe(context: TacticsContext): TacticsFrame {
    return this.frame(context, true);
  }

  private frame(context: TacticsContext, record: boolean): TacticsFrame {
    const kite = kiteOf(context);
    const state = this.deps.combat.snapshot(context.targetGuid);
    const channel = this.deps.combat.channel();
    const spells = state.learned.map((id) =>
      spellAction(this.deps, id, context, state),
    );
    const outcome = channel
      ? this.terminalOutcome(context, state)
      : this.outcome({ context, kite, spells, state });
    const candidates: JevCandidate[] = [WAIT];
    if (channel && !outcome)
      candidates.push(...channelCandidates(state, channel, context.targetGuid));
    else if (!outcome)
      this.candidates({ candidates, context, kite, spells, state });
    const closing = closingText(state, this.deps.entity, this.gap, kite);
    const gap = targetGap(state, this.deps.entity, kite);
    if (record) this.gap = gap ?? this.gap;
    const extra = channel
      ? channelObservation(
          channel,
          this.deps.combat.definition(channel.spellId)?.name,
          this.deps.now(),
        )
      : {};
    return this.close({
      candidates,
      closing,
      context,
      extra,
      gap,
      kite,
      longest: longestHostileRange(spells, context.targetGuid),
      outcome,
      separationYd: separation(state),
      spells,
      state,
    });
  }

  private close(input: {
    candidates: JevCandidate[];
    closing: string;
    context: TacticsContext;
    extra: Record<string, unknown>;
    gap: number | undefined;
    kite: boolean;
    longest: number | undefined;
    outcome: TacticsFrame["outcome"];
    separationYd: number | undefined;
    spells: readonly SpellAction[];
    state: CombatState;
  }): TacticsFrame {
    const observed = this.observeParts(input);
    return {
      candidates: observed.candidates,
      observation: withNulls(observed.fields),
      outcome: observed.outcome,
    };
  }

  private observeParts(input: {
    candidates: JevCandidate[];
    closing: string;
    context: TacticsContext;
    extra: Record<string, unknown>;
    gap: number | undefined;
    kite: boolean;
    longest: number | undefined;
    outcome: TacticsFrame["outcome"];
    separationYd: number | undefined;
    spells: readonly SpellAction[];
    state: CombatState;
  }): {
    candidates: JevCandidate[];
    fields: Record<string, unknown>;
    outcome: TacticsFrame["outcome"];
  } {
    const {
      candidates,
      closing,
      context,
      extra,
      gap,
      kite,
      longest,
      outcome,
      separationYd,
      spells,
      state,
    } = input;
    const found = snares(state, (id) => this.deps.combat.definition(id));
    return {
      candidates,
      fields: {
        ...baseObservation({
          deps: this.deps,
          rejections: this.rejections,
          context,
          state,
          spells,
        }),
        ...extra,
        melee: {
          closing,
          gapYd: gap ?? null,
          ...(kite
            ? {
                kite: kiteMelee({
                  closing: closing === "closing",
                  found,
                  retreat: kiteOffers({
                    closing: closing === "closing",
                    gap,
                    longest,
                    separation: separationYd,
                  }).retreat,
                }),
              }
            : {}),
          snares: found,
        },
        danger: combatDangerText({
          deps: this.deps,
          context,
          masked: (id: string) => kiteMasked(this.kite, id),
          previousGap: this.gap,
          spells,
          state,
        }),
      },
      outcome,
    };
  }

  execute(id: string, context: TacticsContext): void {
    const kite = kiteOf(context);
    const frame = this.commit(context);
    if (
      frame.outcome ||
      !frame.candidates.some((candidate) => candidate.id === id)
    )
      throw new Error("action_no_longer_legal");
    if (id === "wait") {
      this.executeWait(context);
      return;
    }
    if (id === "stop") {
      this.deps.control.halt();
      return;
    }
    const state = this.deps.combat.snapshot(context.targetGuid);
    const move = combatMoveOption(
      {
        deps: this.deps,
        context,
        masked: (masked: string) => kiteMasked(this.kite, masked),
        previousGap: this.gap,
        spells: state.learned.map((spellId) =>
          spellAction(this.deps, spellId, context, state),
        ),
        state,
      },
      id,
    );
    if (move?.input !== undefined) {
      driveKiteMove(this.deps.control, this.kite, move, kite);
      return;
    }
    if (id === "cancel") {
      this.deps.combat.cancelCast();
      return;
    }
    if (id === "attack") {
      this.deps.combat.attack(context.targetGuid);
      return;
    }
    if (id === "stop_attack") {
      this.deps.combat.stopAttack();
      return;
    }
    if (id === "stop_auto_shot") {
      this.deps.combat.stopAutoRepeat();
      return;
    }
    if (id === "pet_attack") {
      const pet = petOf(
        this.deps.entity,
        this.deps.combat.snapshot().self.guid,
      );
      if (!pet) throw new Error("action_no_longer_legal");
      this.deps.combat.petAttack(pet.guid, context.targetGuid);
      return;
    }
    this.executeTargeted(id, context);
  }

  private executeWait(context: TacticsContext): void {
    const control = this.deps.control.snapshot();
    if (!control.moving) return;
    const state = this.deps.combat.snapshot(context.targetGuid);
    const placement = movePlacement(
      {
        aggro: this.deps.aggro,
        control: this.deps.control,
        nearby: this.deps.nearby,
      },
      context,
      state,
    );
    const renewed =
      placement &&
      waitRenewal({
        current: control.input,
        ground: this.deps.ground,
        orientation: placement.pose.orientation,
        placement,
      });
    if (renewed) this.deps.control.drive(renewed, PILOT_DEADMAN_MS);
    else this.deps.control.halt();
  }

  private executeTargeted(id: string, context: TacticsContext): void {
    const state = this.deps.combat.snapshot(context.targetGuid);
    if (id === "face_target") {
      const from = state.self.pose;
      const to = state.target?.pose;
      if (!(from && to)) throw new Error("face_target_pose_unobserved");
      this.deps.control.face(bearing(from, to));
      return;
    }
    const action = state.learned
      .map((spellId) => spellAction(this.deps, spellId, context, state))
      .find((entry) => entry.id === id && !entry.reason);
    if (!action?.spell) throw new Error("action_no_longer_legal");
    if (this.deps.control.snapshot().moving && requiresStanding(action.spell))
      this.deps.control.halt();
    this.deps.combat.cast(action.spell.id, action.target);
  }

  private candidates(input: CandidatesInput): void {
    addCandidates(
      {
        deps: this.deps,
        gap: this.gap,
        rejections: this.rejections,
        watch: this.kite,
      },
      input,
    );
  }

  private outcome(input: {
    context: TacticsContext;
    state: CombatState;
    spells: readonly SpellAction[];
    kite: boolean;
  }): TacticsFrame["outcome"] {
    const { context, kite, spells, state } = input;
    const terminal = this.terminalOutcome(context, state);
    if (terminal || state.target?.health === 0) return terminal;
    const now = this.deps.now();
    const timedOut = timeoutOutcome(state, now);
    if (timedOut) return timedOut;
    const target = this.deps.entity(context.targetGuid);
    this.engaged ||= engagedWith(state, target);
    const reason = targetReason(this.deps, context.targetGuid, state);
    if (reason) return { status: "blocked", reason };
    const control = this.deps.control.snapshot();
    if (
      control.blockedReason &&
      !["rooted", "disable_move"].includes(control.blockedReason)
    ) {
      if (kite && KITE_MOVE_REFUSALS[control.blockedReason] === true) {
        maskPendingMove(this.kite);
      } else return { status: "blocked", reason: control.blockedReason };
    }
    return (
      this.reachOutcome({ context, kite, now, spells, state }) ??
      this.progress.observe(state, now)
    );
  }

  private terminalOutcome(
    context: TacticsContext,
    state: CombatState,
  ): TacticsFrame["outcome"] {
    const observed = this.observedOutcome(context, state);
    if (observed) return observed;
    if (state.target?.health !== 0) return undefined;
    const now = this.deps.now();
    this.deadAt ??= now;
    const { engaged } = this;
    const waitedMs = now - this.deadAt;
    const target = this.deps.entity(context.targetGuid);
    return deathOutcome({ engaged, state, target, waitedMs });
  }

  private observedOutcome(
    context: TacticsContext,
    state: CombatState,
  ): TacticsFrame["outcome"] {
    if (
      state.lastXp?.kind === "kill" &&
      state.lastXp.victim === context.targetGuid &&
      state.lastXp.at >= this.startedAt
    )
      return { status: "completed", reason: "server_kill_credit" };
    if (state.self.health === 0)
      return { status: "failed", reason: "self_dead" };
    this.rejections.track(state.lastOutcome);
    return this.rejections.outcome();
  }

  private reachOutcome(input: {
    context: TacticsContext;
    state: CombatState;
    spells: readonly SpellAction[];
    now: number;
    kite: boolean;
  }): TacticsFrame["outcome"] {
    const { context, kite, now, spells, state } = input;
    if (
      !(
        state.pendingCast ||
        state.casting ||
        state.pendingAttack ||
        state.attacking ||
        canMelee(this.deps.entity, state) ||
        spells.some((action) => action.supported)
      )
    )
      return { status: "blocked", reason: "no_supported_combat_actions" };
    if (this.targetReachable(context, state, spells)) {
      this.unreachable = undefined;
      return undefined;
    }
    if (
      kite &&
      kiteHolding({
        distance: separation(state),
        gap: targetGap(state, this.deps.entity, true),
        longest: longestHostileRange(spells, context.targetGuid),
        previous: this.gap,
      })
    ) {
      this.unreachable = undefined;
      return undefined;
    }
    const range = separation(state);
    const last = this.unreachable;
    if (!last || approached(range, last.range)) {
      this.unreachable = { at: now, range };
      return undefined;
    }
    last.range ??= range;
    if (now - last.at >= UNREACHABLE_TIMEOUT_MS)
      return { status: "blocked", reason: "target_unreachable" };
    return undefined;
  }

  private targetReachable(
    context: TacticsContext,
    state: CombatState,
    spells: readonly SpellAction[],
  ): boolean {
    if (
      state.pendingCast ||
      state.casting ||
      state.pendingAttack ||
      state.attacking ||
      inMelee(this.deps.entity, state)
    )
      return true;
    const distance = separation(state);
    for (const action of spells) {
      if (
        action.target !== context.targetGuid ||
        !action.supported ||
        !action.spell
      )
        continue;
      if (!action.reason || action.reason === "not_facing") return true;
      const range = action.spell.range;
      if (
        range &&
        distance !== undefined &&
        distance >= range.minHostile &&
        distance <= range.maxHostile &&
        RANGE_HELD_REASONS.has(action.reason)
      )
        return true;
    }
    return false;
  }
}
