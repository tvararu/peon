import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  InspectHonorStats,
  PvpCredit,
} from "#wow/areas/battlegrounds/protocol";
import type {
  BattlefieldList,
  BattlefieldStatus,
} from "#wow/areas/battlegrounds/protocol-queue";
import {
  type BattlegroundsQueue,
  type BattlegroundsQueueEvent,
  BattlegroundsQueueTracker,
  type BattlegroundsSlot,
} from "#wow/areas/battlegrounds/store-queue";
import {
  type BattlegroundsFlag,
  type BattlegroundsSelf,
  BattlegroundsSelfTracker,
} from "#wow/areas/battlegrounds/store-self";
import { UnitFlag } from "#wow/protocol/entity-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type BattlegroundsHonorCredit = PvpCredit & { type: "honor_credit" };

export type BattlegroundsHonorInspect = InspectHonorStats & {
  type: "honor_inspect";
};

export type BattlegroundsZoneAlert = {
  type: "zone_under_attack";
  areaId: number;
  at: number;
  here: boolean;
};

export type BattlegroundsPvpKillQuest = {
  type: "pvp_kill_quest";
  quest: number;
  count: number;
  required: number;
};

export type BattlegroundsEvent =
  | BattlegroundsFlag
  | BattlegroundsHonorCredit
  | BattlegroundsHonorInspect
  | BattlegroundsZoneAlert
  | BattlegroundsPvpKillQuest
  | BattlegroundsQueueEvent;

export type BattlegroundsState = {
  self: BattlegroundsSelf;
  queue: BattlegroundsQueue;
  credits: readonly PvpCredit[];
  zoneAlerts: readonly { areaId: number; at: number }[];
  inspect: ReadonlyMap<bigint, InspectHonorStats>;
};

const CREDITS_MAX = 20;
const ZONE_ALERTS_MAX = 10;

export class BattlegroundsStore {
  private readonly events = new Emitter<[BattlegroundsEvent]>();
  private readonly now: () => number;
  private readonly selfTracker: BattlegroundsSelfTracker;
  private readonly queueTracker: BattlegroundsQueueTracker;
  private readonly deps: SessionDeps;
  private credits: PvpCredit[] = [];
  private zoneAlerts: { areaId: number; at: number }[] = [];
  private inspect = new Map<bigint, InspectHonorStats>();

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.deps = deps;
    this.now = deps.now;
    this.queueTracker = new BattlegroundsQueueTracker(deps.now, (event) =>
      this.events.emit(event),
    );
    this.selfTracker = new BattlegroundsSelfTracker(deps);
    this.selfTracker.onEvent((event) => this.events.emit(event));
  }

  snapshot(): BattlegroundsState {
    return {
      credits: [...this.credits],
      inspect: new Map(this.inspect),
      queue: this.queueTracker.snapshot(),
      self: this.selfTracker.snapshot(),
      zoneAlerts: this.zoneAlerts.map((alert) => ({ ...alert })),
    };
  }

  onEvent(cb: (event: BattlegroundsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  observeEntity(guid: bigint): void {
    this.selfTracker.observe(guid);
  }

  selfInCombat(): boolean {
    const self = this.deps.getEntity(this.deps.selfGuid());
    if (!(self && "unitFlags" in self)) return false;
    return (self.unitFlags & UnitFlag.IN_COMBAT) !== 0;
  }

  slot(index: number): BattlegroundsSlot {
    return this.queueTracker.slot(index);
  }

  receiveBattlefieldStatus(status: BattlefieldStatus): void {
    this.queueTracker.receiveStatus(status);
  }

  receiveBattlefieldList(list: BattlefieldList): void {
    this.queueTracker.receiveList(list);
  }

  receiveGroupJoined(result: number, guid: bigint | undefined): void {
    this.queueTracker.receiveJoinResult(result, guid);
  }

  receivePvpCredit(credit: PvpCredit): void {
    this.credits = [...this.credits, credit].slice(-CREDITS_MAX);
    this.events.emit({ ...credit, type: "honor_credit" });
  }

  receiveInspectHonor(stats: InspectHonorStats): void {
    this.inspect = new Map(this.inspect).set(stats.guid, stats);
    this.events.emit({ ...stats, type: "honor_inspect" });
  }

  receiveZoneUnderAttack(areaId: number, here: boolean): void {
    const alert = { areaId, at: this.now() };
    this.zoneAlerts = [...this.zoneAlerts, alert].slice(-ZONE_ALERTS_MAX);
    this.events.emit({ ...alert, here, type: "zone_under_attack" });
  }

  receivePvpKillQuest(init: {
    quest: number;
    count: number;
    required: number;
  }): void {
    this.events.emit({ ...init, type: "pvp_kill_quest" });
  }

  dispose(): void {
    this.selfTracker.dispose();
    this.queueTracker.dispose();
    this.credits = [];
    this.zoneAlerts = [];
    this.inspect = new Map();
    this.events.clear();
  }
}
