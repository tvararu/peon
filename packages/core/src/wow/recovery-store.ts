import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { ControlPose } from "#wow/control";
import type { EntityEvent, EntityLookup } from "#wow/entity-store";
import {
  type PlayerLife,
  type PlayerLifeState,
  readLife,
} from "#wow/player-state";
import type {
  CorpseQuery,
  CorpseReclaimDelay,
  DeathReleaseLocation,
  ResurrectRequest,
  SpiritHealerConfirm,
} from "#wow/protocol/death";
import type {
  RecoveryCorpse,
  RecoveryDelay,
  RecoveryEvent,
  RecoveryReclaim,
  RecoveryRequest,
  RecoveryResurrection,
  RecoverySpiritHealerConfirm,
  RecoveryState,
  ResurrectionResponse,
  SpiritHealerCleared,
} from "#wow/recovery";
import { reclaimGate } from "#wow/recovery-reclaim";

export type RecoveryStoreDeps = {
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export type RecoverySpiritHealerRequest = {
  action: "spirit-healer";
  status: "unanswered";
  epoch: number;
  requestedAt: number;
  guid: bigint;
};

function copyCorpse(corpse: RecoveryCorpse): RecoveryCorpse {
  return corpse.status === "found"
    ? { ...corpse, position: { ...corpse.position } }
    : { ...corpse };
}

function copyGraveyard(
  value: DeathReleaseLocation | undefined,
): DeathReleaseLocation | undefined {
  if (!value) return undefined;
  return value.kind === "location"
    ? { ...value, position: { ...value.position } }
    : { ...value };
}

export function dead(life: PlayerLife): boolean {
  return life === "dead" || life === "ghost";
}

export type RecoveryChange = Omit<RecoveryEvent, "state">;

export class RecoveryStore {
  private readonly deps: RecoveryStoreDeps;
  private readonly events = new Emitter<[RecoveryChange]>();
  private isDisposed = false;
  private unavailable = false;
  private epoch = 0;
  private lastLife: PlayerLife;
  private corpse: RecoveryCorpse = { status: "unknown" };
  private queryPending: { epoch: number; requestedAt: number } | undefined;
  private delay: RecoveryDelay | undefined;
  private graveyard: DeathReleaseLocation | undefined;
  private request: RecoveryRequest | undefined;
  private spiritHealerPending: RecoverySpiritHealerRequest | undefined;
  private spiritHealerCleared: SpiritHealerCleared | undefined;
  private spiritHealerConfirm: RecoverySpiritHealerConfirm | undefined;
  private offer:
    | {
        packet: ResurrectRequest;
        receivedAt: number;
        response: ResurrectionResponse;
      }
    | undefined;

  constructor(deps: RecoveryStoreDeps) {
    this.deps = deps;
    this.lastLife = this.life().life;
  }

  onEvent(listener: (change: RecoveryChange) => void): Unsubscribe {
    if (this.isDisposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get pendingQuery(): { epoch: number; requestedAt: number } | undefined {
    return this.queryPending;
  }

  get pendingSpiritHealer(): RecoverySpiritHealerRequest | undefined {
    return this.spiritHealerPending;
  }

  snapshot(pose?: ControlPose): RecoveryState {
    const life = this.life();
    const request = this.request ?? this.spiritHealerPending;
    return {
      ...life,
      selfGuid: this.deps.selfGuid(),
      epoch: this.epoch,
      corpse: copyCorpse(this.corpse),
      query: this.queryPending
        ? {
            ...this.queryPending,
            status:
              this.queryPending.epoch === this.epoch ? "unanswered" : "stale",
          }
        : undefined,
      reclaimDelay: this.delay ? { ...this.delay } : undefined,
      reclaim: this.reclaim(pose),
      graveyard: copyGraveyard(this.graveyard),
      resurrection: this.resurrection(),
      request: request ? { ...request } : undefined,
      spiritHealerCleared: this.spiritHealerCleared
        ? { ...this.spiritHealerCleared }
        : undefined,
      spiritHealerConfirm: this.spiritHealerConfirm
        ? { ...this.spiritHealerConfirm }
        : undefined,
      disposed: this.isDisposed,
    };
  }

  reclaim(pose: ControlPose | undefined): RecoveryReclaim {
    return reclaimGate({
      life: this.life().life,
      corpse: this.corpse,
      delay: this.delay,
      pose,
      now: this.deps.now(),
    });
  }

  observeEntity(event: EntityEvent): void {
    if (this.isDisposed) return;
    if (event.type === "disappear") {
      if (event.guid !== this.deps.selfGuid()) return;
      this.unavailable = true;
      this.newEpoch();
      this.lastLife = "unknown";
      this.emit("recovery_invalidated");
      return;
    }
    if (event.entity.guid !== this.deps.selfGuid()) return;
    if (event.type === "appear") this.unavailable = false;
    this.observeLife();
  }

  requestQuery(): void {
    const requestedAt = this.deps.now();
    this.queryPending = { epoch: this.epoch, requestedAt };
    if (!this.spiritHealerPending) {
      this.request = {
        action: "query",
        status: "unanswered",
        epoch: this.epoch,
        requestedAt,
      };
    }
    this.emit("corpse_query_requested");
  }

  requestRelease(): void {
    this.request = {
      action: "release",
      status: "unanswered",
      epoch: this.epoch,
      requestedAt: this.deps.now(),
    };
    this.emit("release_requested");
  }

  requestReclaim(timing: "known" | "unknown"): void {
    this.request = {
      action: "reclaim",
      status: "unanswered",
      epoch: this.epoch,
      requestedAt: this.deps.now(),
      timing,
    };
    this.emit("reclaim_requested");
  }

  requestSpiritHealer(guid: bigint): void {
    this.spiritHealerPending = {
      action: "spirit-healer",
      status: "unanswered",
      epoch: this.epoch,
      requestedAt: this.deps.now(),
      guid,
    };
    this.request = this.spiritHealerPending;
    this.emit("spirit_healer_requested");
  }

  requestResurrection(offer: RecoveryResurrection, accept: boolean): void {
    if (this.offer)
      this.offer.response = accept ? "accept_requested" : "decline_requested";
    this.request = {
      action: "resurrection",
      status: "unanswered",
      epoch: this.epoch,
      requestedAt: this.deps.now(),
      guid: offer.guid,
      accept,
      timing: offer.readyAt === undefined ? "unknown" : "known",
    };
    this.emit("resurrection_response_requested");
  }

  clearSpiritHealer(reason: SpiritHealerCleared["reason"]): void {
    const pending = this.spiritHealerPending;
    if (this.isDisposed || !pending) return;
    const { guid, requestedAt } = pending;
    this.spiritHealerCleared = {
      guid,
      requestedAt,
      clearedAt: this.deps.now(),
      reason,
    };
    this.spiritHealerPending = undefined;
    if (this.request === pending) this.request = undefined;
    this.emit("spirit_healer_cleared");
  }

  receiveCorpse(response: CorpseQuery): void {
    if (this.isDisposed) return;
    this.observeLife();
    const pending = this.queryPending;
    this.queryPending = undefined;
    if (!pending || pending.epoch !== this.epoch || this.unavailable) {
      this.emit("corpse_query_discarded");
      return;
    }
    const observedAt = this.deps.now();
    this.corpse = response.found
      ? {
          status: "found",
          mapId: response.mapId,
          corpseMapId: response.corpseMapId,
          position: { ...response.position },
          unknown: response.unknown,
          observedAt,
        }
      : { status: "absent", observedAt };
    if (this.request?.action === "query") {
      this.request = this.spiritHealerPending;
    }
    this.emit("corpse_observed");
  }

  receiveReclaimDelay({ delayMs }: CorpseReclaimDelay): void {
    if (this.isDisposed) return;
    this.observeLife();
    if (this.unavailable) return;
    const receivedAt = this.deps.now();
    this.delay = { delayMs, receivedAt, readyAt: receivedAt + delayMs };
    this.emit("reclaim_delay_observed");
  }

  receiveGraveyard(location: DeathReleaseLocation): void {
    if (this.isDisposed) return;
    this.observeLife();
    if (this.unavailable) return;
    this.graveyard = location;
    this.emit("graveyard_observed");
  }

  receiveResurrectRequest(packet: ResurrectRequest): void {
    if (this.isDisposed) return;
    this.observeLife();
    if (this.unavailable || this.life().life === "alive") return;
    this.offer = {
      packet,
      receivedAt: this.deps.now(),
      response: "unanswered",
    };
    this.emit("resurrection_offered");
  }

  receiveSpiritHealerConfirm(packet: SpiritHealerConfirm): void {
    if (this.isDisposed) return;
    this.observeLife();
    if (this.unavailable || !dead(this.life().life)) return;
    this.spiritHealerConfirm = { ...packet, receivedAt: this.deps.now() };
    this.emit("spirit_healer_confirm_observed");
  }

  dispose(): void {
    this.isDisposed = true;
    this.events.clear();
    this.unavailable = true;
    this.queryPending = undefined;
    this.newEpoch();
    this.lastLife = "unknown";
  }

  life(): PlayerLifeState {
    if (this.unavailable || this.isDisposed)
      return { life: "unknown", health: undefined, flags: undefined };
    return readLife(this.deps.selfGuid(), this.deps.getEntity);
  }

  observeLife(): void {
    const life = this.life().life;
    if (life === this.lastLife) return;
    if (
      (this.lastLife === "alive" && dead(life)) ||
      (dead(this.lastLife) && life === "alive")
    )
      this.newEpoch();
    if (this.request?.action === "release" && life === "ghost")
      this.request = undefined;
    if (life === "alive") {
      this.spiritHealerPending = undefined;
      if (this.request?.action === "spirit-healer") this.request = undefined;
    }
    this.lastLife = life;
    this.emit("life_observed");
  }

  resurrection(): RecoveryResurrection | undefined {
    if (!this.offer) return undefined;
    const { packet, receivedAt, response } = this.offer;
    const readyAt =
      packet.delayMs === undefined
        ? this.delay?.readyAt
        : receivedAt + packet.delayMs;
    const name = packet.name || this.deps.getEntity(packet.guid)?.name || "";
    return { ...packet, name, receivedAt, readyAt, response };
  }

  private newEpoch(): void {
    this.epoch++;
    this.corpse = { status: "unknown" };
    this.delay = undefined;
    this.graveyard = undefined;
    this.offer = undefined;
    this.request = undefined;
    this.spiritHealerPending = undefined;
    this.spiritHealerConfirm = undefined;
  }

  private emit(type: RecoveryEvent["type"]): void {
    this.events.emit({ type, at: this.deps.now() });
  }
}
