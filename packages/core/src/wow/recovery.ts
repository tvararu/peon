import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { ControlPose } from "#wow/control";
import { type EntityLookup, isUnit } from "#wow/entity-store";
import type { PlayerLifeState } from "#wow/player-state";
import {
  buildReclaimCorpse,
  buildRepopRequest,
  buildResurrectResponse,
  buildSpiritHealerActivate,
  type DeathReleaseLocation,
  type ResurrectRequest,
  type SpiritHealerConfirm,
} from "#wow/protocol/death";
import { NpcFlag, ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { Vec3 } from "#wow/protocol/packet";
import { dead, type RecoveryStore } from "#wow/recovery-store";

export type RecoveryDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
  pose: () => ControlPose | undefined;
};

export type RecoveryCorpse =
  | { status: "unknown" }
  | { status: "absent"; observedAt: number }
  | {
      status: "found";
      mapId: number;
      corpseMapId: number;
      position: Vec3;
      unknown: number;
      observedAt: number;
    };

export type RecoveryDelay = {
  delayMs: number;
  receivedAt: number;
  readyAt: number;
};
export type RecoveryQuery = {
  status: "unanswered" | "stale";
  epoch: number;
  requestedAt: number;
};

type RequestBase = { status: "unanswered"; epoch: number; requestedAt: number };
export type RecoveryRequest = RequestBase &
  (
    | { action: "query" }
    | { action: "release" }
    | { action: "reclaim"; timing: "known" | "unknown" }
    | { action: "spirit-healer"; guid: bigint }
    | {
        action: "resurrection";
        guid: bigint;
        accept: boolean;
        timing: "known" | "unknown";
      }
  );
export type ResurrectionResponse =
  | "unanswered"
  | "accept_requested"
  | "decline_requested";
export type RecoveryResurrection = ResurrectRequest & {
  receivedAt: number;
  readyAt: number | undefined;
  response: ResurrectionResponse;
};

export type RecoveryReclaim = {
  canRequest: boolean;
  readiness: "blocked" | "ready" | "unverified";
  reason: string | undefined;
  distance: number | undefined;
  remainingMs: number | undefined;
  pose: ControlPose | undefined;
};

export const SPIRIT_HEALER_TIMEOUT_MS = 10_000;
export type SpiritHealerCleared = {
  guid: bigint;
  requestedAt: number;
  clearedAt: number;
  reason: "timeout" | "halt";
};

export type RecoverySpiritHealerConfirm = SpiritHealerConfirm & {
  receivedAt: number;
};

export type RecoveryState = PlayerLifeState & {
  selfGuid: bigint;
  epoch: number;
  corpse: RecoveryCorpse;
  query: RecoveryQuery | undefined;
  reclaimDelay: RecoveryDelay | undefined;
  reclaim: RecoveryReclaim;
  graveyard: DeathReleaseLocation | undefined;
  resurrection: RecoveryResurrection | undefined;
  request: RecoveryRequest | undefined;
  spiritHealerCleared: SpiritHealerCleared | undefined;
  spiritHealerConfirm: RecoverySpiritHealerConfirm | undefined;
  disposed: boolean;
};

export type RecoveryEvent = {
  type:
    | "life_observed"
    | "recovery_invalidated"
    | "corpse_query_requested"
    | "corpse_observed"
    | "corpse_query_discarded"
    | "reclaim_delay_observed"
    | "graveyard_observed"
    | "resurrection_offered"
    | "release_requested"
    | "reclaim_requested"
    | "spirit_healer_requested"
    | "spirit_healer_cleared"
    | "spirit_healer_confirm_observed"
    | "resurrection_response_requested";
  at: number;
  state: RecoveryState;
};

export class RecoveryRuntime {
  private readonly store: RecoveryStore;
  private readonly deps: RecoveryDeps;
  private readonly events = new Emitter<[RecoveryEvent]>();
  private disposed = false;

  constructor(store: RecoveryStore, deps: RecoveryDeps) {
    this.store = store;
    this.deps = deps;
    store.onEvent((event) => this.events.emit(event));
  }

  onEvent(listener: (event: RecoveryEvent) => void): Unsubscribe {
    if (this.disposed || this.store.disposed) return () => undefined;
    return this.events.subscribe(listener);
  }

  snapshot(): RecoveryState {
    return this.store.snapshot();
  }

  queryCorpse(): RecoveryState {
    this.active();
    this.store.observeLife();
    if (this.store.pendingQuery)
      throw new Error("Previous corpse query remains unanswered");
    this.deps.send(GameOpcode.MSG_CORPSE_QUERY);
    return this.store.requestQuery();
  }

  releaseSpirit(): RecoveryState {
    this.active();
    this.store.observeLife();
    if (this.store.life().life !== "dead")
      throw new Error("Release requires authoritative dead state");
    this.deps.send(GameOpcode.CMSG_REPOP_REQUEST, buildRepopRequest(0));
    return this.store.requestRelease();
  }

  reclaimCorpse(): RecoveryState {
    this.active();
    this.store.observeLife();
    const gate = this.store.reclaim();
    if (!gate.canRequest)
      throw new Error(`Cannot request reclaim: ${gate.reason}`);
    this.deps.send(GameOpcode.CMSG_RECLAIM_CORPSE, buildReclaimCorpse(0n));
    return this.store.requestReclaim(
      gate.remainingMs === undefined ? "unknown" : "known",
    );
  }

  activateSpiritHealer(guid: bigint): RecoveryState {
    this.active();
    this.store.observeLife();
    if (this.store.life().life !== "ghost")
      throw new Error("Spirit-healer activation requires observed ghost state");
    const pending = this.store.pendingSpiritHealer;
    if (
      pending &&
      this.deps.now() - pending.requestedAt >= SPIRIT_HEALER_TIMEOUT_MS
    )
      this.clearSpiritHealer("timeout");
    if (this.store.pendingSpiritHealer)
      throw new Error(
        "Previous spirit-healer request remains unanswered; retry after 10 s or halt",
      );
    if (guid === 0n) throw new Error("Spirit-healer GUID is unknown");
    const healer = this.deps.getEntity(guid);
    if (
      !isUnit(healer) ||
      healer.objectType !== ObjectType.UNIT ||
      (healer.npcFlags & NpcFlag.SPIRIT_HEALER) === 0
    )
      throw new Error("Observed creature is not a spirit healer");
    this.deps.send(
      GameOpcode.CMSG_SPIRIT_HEALER_ACTIVATE,
      buildSpiritHealerActivate(guid),
    );
    return this.store.requestSpiritHealer(guid);
  }

  clearSpiritHealer(reason: SpiritHealerCleared["reason"]): void {
    if (this.disposed) return;
    this.store.clearSpiritHealer(reason);
  }

  respondResurrection(accept: boolean): RecoveryState {
    this.active();
    this.store.observeLife();
    if (!dead(this.store.life().life))
      throw new Error(
        "Resurrection response requires observed dead or ghost state",
      );
    const offer = this.store.resurrection();
    if (!offer) throw new Error("No current resurrection offer");
    if (offer.response !== "unanswered")
      throw new Error("Resurrection offer already answered");
    if (
      accept &&
      offer.readyAt !== undefined &&
      this.deps.now() < offer.readyAt
    )
      throw new Error("Resurrection offer delay has not elapsed");
    this.deps.send(
      GameOpcode.CMSG_RESURRECT_RESPONSE,
      buildResurrectResponse(offer.guid, accept),
    );
    return this.store.requestResurrection(offer, accept);
  }

  dispose(): void {
    this.disposed = true;
    this.events.clear();
  }

  private active(): void {
    if (this.disposed || this.store.disposed)
      throw new Error("Recovery runtime disposed");
    if (!this.deps.selfGuid())
      throw new Error("Authenticated player GUID is unknown");
  }
}
