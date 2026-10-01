import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  joinReasonName,
  type LfgJoinReason,
  type LfgRoleCheckStateName,
} from "#wow/areas/lfg/names";
import type {
  LfgBootUpdate,
  LfgJoinResult,
  LfgPlayerInfo,
  LfgProposal,
  LfgQueueStatus,
  LfgReward,
  LfgUpdate,
  RoleCheckUpdate,
  RoleChosen,
} from "#wow/areas/lfg/protocol";
import {
  bootView,
  copyProposal,
  copyReward,
  LFG_PROPOSAL_SECONDS,
  type LfgBootView,
  type LfgJoinView,
  type LfgLockView,
  type LfgOfferContinueView,
  type LfgPartyLocks,
  type LfgProposalView,
  type LfgRandomView,
  type LfgRewardView,
  type LfgRoleCheckView,
  type LfgTeleportDeniedView,
  type LfgTeleportReason,
  lockView,
  proposalView,
  roleCheckView,
  teleportReasonName,
} from "#wow/areas/lfg/views";
import { UnitFlag } from "#wow/protocol/entity-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type LfgStatus = "none" | "queued" | "proposal";
export type LfgUpdateSource = "player" | "party" | "search";
export type LfgState = {
  status: LfgStatus;
  selected: readonly number[];
  comment: string;
  searching: boolean;
  available: readonly LfgRandomView[];
  locks: readonly LfgLockView[];
  locksAt: number | undefined;
  partyLocks: readonly LfgPartyLocks[];
  partyLocksAt: number | undefined;
  joinResult: LfgJoinView | undefined;
  queue: LfgQueueStatus | undefined;
  roleCheck: LfgRoleCheckView | undefined;
  proposal: LfgProposalView | undefined;
  boot: LfgBootView | undefined;
  teleportDenied: LfgTeleportDeniedView | undefined;
  offerContinue: LfgOfferContinueView | undefined;
  reward: LfgRewardView | undefined;
};

export type LfgEvent =
  | {
      type: "status";
      status: LfgStatus;
      previous: LfgStatus;
      source: LfgUpdateSource;
      updateType: number;
    }
  | { type: "dungeons"; scope: "player" | "party" }
  | {
      type: "join_result";
      result: number;
      state: number;
      reason: LfgJoinReason;
    }
  | { type: "queue"; dungeon: number; queuedTime: number }
  | { type: "role_check"; state: number; stateName: LfgRoleCheckStateName }
  | { type: "role_chosen"; guid: bigint; roles: number; ready: boolean }
  | {
      type: "proposal";
      id: number;
      dungeon: number;
      state: number;
      deadline: number;
      selfAnswered: boolean;
      selfAccepted: boolean;
    }
  | {
      type: "boot_vote";
      inProgress: boolean;
      victim: bigint;
      votes: number;
      agrees: number;
      needed: number;
      deadline: number | undefined;
    }
  | { type: "teleport_denied"; code: number; reason: LfgTeleportReason }
  | { type: "offer_continue"; entry: number }
  | {
      type: "reward";
      randomDungeon: number;
      dungeon: number;
      money: number;
      xp: number;
      itemCount: number;
    };

const RAID_BROWSER_JOIN = 3;
const ROLECHECK_ABORT = 4;
const JOIN_QUEUE = 5;
const ROLECHECK_FAIL = 6;
const REMOVED_FROM_QUEUE = 7;
const PROPOSAL_FAIL = 8;
const PROPOSAL_DECLINED = 9;
const JOIN_RAIDBROWSER = 2;
const ADDED_TO_QUEUE = 12;
const PROPOSAL_BEGIN = 13;
const UPDATE_STATUS = 14;

function statusOf(updateType: number, queued: boolean): LfgStatus | "keep" {
  switch (updateType) {
    case JOIN_QUEUE:
    case ADDED_TO_QUEUE:
      return "queued";
    case ROLECHECK_ABORT:
    case ROLECHECK_FAIL:
    case REMOVED_FROM_QUEUE:
    case PROPOSAL_FAIL:
    case PROPOSAL_DECLINED:
      return "none";
    case PROPOSAL_BEGIN:
      return "proposal";
    case UPDATE_STATUS:
      return queued ? "queued" : "keep";
    case RAID_BROWSER_JOIN:
      return "keep";
    case JOIN_RAIDBROWSER:
      return "keep";
    default:
      return "keep";
  }
}

const EMPTY: LfgState = {
  status: "none",
  selected: [],
  comment: "",
  searching: false,
  available: [],
  locks: [],
  locksAt: undefined,
  partyLocks: [],
  partyLocksAt: undefined,
  joinResult: undefined,
  queue: undefined,
  roleCheck: undefined,
  proposal: undefined,
  boot: undefined,
  teleportDenied: undefined,
  offerContinue: undefined,
  reward: undefined,
};

export class LfgStore {
  private readonly events = new Emitter<[LfgEvent]>();
  private state: LfgState = EMPTY;
  private readonly now: () => number;
  private readonly deps: SessionDeps;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
    this.deps = deps;
  }

  selfInCombat(): boolean {
    const self = this.deps.getEntity(this.deps.selfGuid());
    if (!(self && "unitFlags" in self)) return false;
    return (self.unitFlags & UnitFlag.IN_COMBAT) !== 0;
  }

  snapshot(): LfgState {
    return {
      ...this.state,
      selected: [...this.state.selected],
      available: this.state.available.map((d) => ({ ...d })),
      locks: this.state.locks.map((l) => ({ ...l })),
      partyLocks: this.state.partyLocks.map((p: LfgPartyLocks) => ({
        guid: p.guid,
        locks: p.locks.map((l: LfgLockView) => ({ ...l })),
      })),
      joinResult:
        this.state.joinResult === undefined
          ? undefined
          : {
              ...this.state.joinResult,
              partyLocks: this.state.joinResult.partyLocks.map(
                (p: LfgPartyLocks) => ({
                  guid: p.guid,
                  locks: p.locks.map((l: LfgLockView) => ({ ...l })),
                }),
              ),
            },
      roleCheck:
        this.state.roleCheck === undefined
          ? undefined
          : {
              ...this.state.roleCheck,
              dungeons: [...this.state.roleCheck.dungeons],
              ready: [...this.state.roleCheck.ready],
              pending: [...this.state.roleCheck.pending],
            },
      proposal: copyProposal(this.state.proposal),
      boot: this.state.boot === undefined ? undefined : { ...this.state.boot },
      teleportDenied:
        this.state.teleportDenied === undefined
          ? undefined
          : { ...this.state.teleportDenied },
      offerContinue:
        this.state.offerContinue === undefined
          ? undefined
          : { ...this.state.offerContinue },
      reward: copyReward(this.state.reward),
    };
  }
  onEvent(cb: (event: LfgEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveUpdate(update: LfgUpdate, source: "player" | "party"): void {
    const next = statusOf(update.updateType, update.queued);
    const previous = this.state.status;
    if (next === "keep") {
      this.events.emit({
        type: "status",
        status: previous,
        previous,
        source,
        updateType: update.updateType,
      });
      return;
    }
    this.set({
      status: next,
      selected: next === "none" ? [] : [...update.dungeons],
      comment: next === "none" ? "" : update.comment,
      queue: undefined,
      roleCheck: next === "none" ? undefined : this.state.roleCheck,
    });
    this.events.emit({
      type: "status",
      status: next,
      previous,
      source,
      updateType: update.updateType,
    });
  }

  receivePlayerInfo(info: LfgPlayerInfo): void {
    this.set({
      available: info.random.map((d) => ({
        entry: d.entry,
        id: d.entry & 0x00_ff_ff_ff,
      })),
      locks: info.locks.map((l) => lockView(l.entry, l.status)),
      locksAt: this.now(),
    });
    this.events.emit({ type: "dungeons", scope: "player" });
  }

  receivePartyInfo(
    players: readonly {
      guid: bigint;
      locks: readonly { entry: number; status: number }[];
    }[],
  ): void {
    this.set({
      partyLocks: players.map((p) => ({
        guid: p.guid,
        locks: p.locks.map((l) => lockView(l.entry, l.status)),
      })),
      partyLocksAt: this.now(),
    });
    this.events.emit({ type: "dungeons", scope: "party" });
  }
  receiveJoinResult(join: LfgJoinResult): void {
    const view: LfgJoinView = {
      result: join.result,
      state: join.state,
      reason: joinReasonName(join.result),
      partyLocks: join.partyLocks.map((p) => ({
        guid: p.guid,
        locks: p.locks.map((l) => lockView(l.entry, l.status)),
      })),
    };
    this.set({ joinResult: view });
    this.events.emit({
      type: "join_result",
      result: join.result,
      state: join.state,
      reason: view.reason,
    });
  }

  receiveQueueStatus(queue: LfgQueueStatus): void {
    this.set({ queue: { ...queue } });
    this.events.emit({
      type: "queue",
      dungeon: queue.dungeon,
      queuedTime: queue.queuedTime,
    });
  }

  receiveRoleCheck(update: RoleCheckUpdate): void {
    const view = roleCheckView(update);
    this.set({ roleCheck: view });
    this.events.emit({
      type: "role_check",
      state: update.state,
      stateName: view.stateName,
    });
  }

  receiveRoleChosen(chosen: RoleChosen): void {
    const current = this.state.roleCheck;
    if (current !== undefined) {
      const chosenGuids: readonly bigint[] = [chosen.guid];
      const ready = chosen.ready
        ? [
            ...current.ready.filter((guid) => !chosenGuids.includes(guid)),
            chosen.guid,
          ]
        : current.ready;
      this.set({
        roleCheck: {
          ...current,
          ready,
          pending: current.pending.filter((guid) => guid !== chosen.guid),
        },
      });
    }
    this.events.emit({
      type: "role_chosen",
      guid: chosen.guid,
      roles: chosen.roles,
      ready: chosen.ready,
    });
  }

  receiveProposal(proposal: LfgProposal): void {
    const at = this.now();
    const current = this.state.proposal;
    const ended = proposal.state !== 0;
    const deadline =
      current?.id === proposal.id
        ? current.deadline
        : at + LFG_PROPOSAL_SECONDS * 1000;
    this.set({
      proposal: ended ? undefined : proposalView(proposal, at, deadline),
    });
    const self = proposal.players.find((player) => player.self);
    this.events.emit({
      type: "proposal",
      id: proposal.id,
      dungeon: proposal.dungeon,
      state: proposal.state,
      deadline,
      selfAnswered: self?.answered ?? false,
      selfAccepted: self?.accepted ?? false,
    });
  }

  receiveBoot(boot: LfgBootUpdate): void {
    const view = boot.inProgress ? bootView(boot, this.now()) : undefined;
    this.set({ boot: view });
    this.events.emit({
      type: "boot_vote",
      inProgress: boot.inProgress,
      victim: boot.victim,
      votes: boot.votes,
      agrees: boot.agrees,
      needed: boot.needed,
      deadline: view?.deadline,
    });
  }

  receiveTeleportDenied(code: number): void {
    const reason = teleportReasonName(code);
    this.set({ teleportDenied: { code, reason, at: this.now() } });
    this.events.emit({ type: "teleport_denied", code, reason });
  }

  receiveOfferContinue(entry: number): void {
    this.set({ offerContinue: { entry, at: this.now() } });
    this.events.emit({ type: "offer_continue", entry });
  }

  receiveReward(reward: LfgReward): void {
    this.set({
      reward: {
        ...reward,
        items: reward.items.map((item) => ({ ...item })),
        at: this.now(),
      },
    });
    this.events.emit({
      type: "reward",
      randomDungeon: reward.randomDungeon,
      dungeon: reward.dungeon,
      money: reward.money,
      xp: reward.xp,
      itemCount: reward.items.length,
    });
  }

  receiveSearch(on: boolean): void {
    if (this.state.searching === on) return;
    const previous = this.state.status;
    this.set({ searching: on });
    this.events.emit({
      type: "status",
      status: previous,
      previous,
      source: "search",
      updateType: on ? 3 : 2,
    });
  }

  dispose(): void {
    this.events.clear();
  }

  private set(next: Partial<LfgState>): void {
    this.state = { ...this.state, ...next };
  }
}

export function createLfgStore(deps: SessionDeps, core: CoreStores): LfgStore {
  return new LfgStore(deps, core);
}
