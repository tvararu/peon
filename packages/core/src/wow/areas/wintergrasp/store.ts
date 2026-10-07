import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  LEAVE_REASON_NAMES,
  type WgBuildingDamage,
  type WgEjected,
  type WgEntered,
  type WgEntryInvite,
  type WgQueueInvite,
  type WgQueueResponse,
} from "#wow/areas/wintergrasp/protocol";

export type WintergraspPhase =
  | "none"
  | "queue_offered"
  | "queued"
  | "entry_offered"
  | "at_war"
  | "ejected";

export type WintergraspState = {
  battleId: number | undefined;
  zone: number | undefined;
  phase: WintergraspPhase;
  full: boolean;
  expiresAt: number | undefined;
  ejectReason: string | undefined;
};

export type WintergraspEvent =
  | { type: "wg_queue_offered"; battleId: number }
  | { type: "wg_queued"; battleId: number; zone: number; queued: boolean }
  | { type: "wg_entry_offered"; battleId: number; expiresAt: number }
  | { type: "wg_entered"; battleId: number }
  | { type: "wg_ejected"; battleId: number; reason: string }
  | { type: "building_damage"; damage: WgBuildingDamage };

export class WintergraspStore {
  private readonly events = new Emitter<[WintergraspEvent]>();
  private state: WintergraspState = {
    battleId: undefined,
    ejectReason: undefined,
    expiresAt: undefined,
    full: false,
    phase: "none",
    zone: undefined,
  };

  snapshot(): WintergraspState {
    return { ...this.state };
  }

  onEvent(cb: (event: WintergraspEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  dispose(): void {
    this.events.clear();
  }

  receiveQueueInvite(invite: WgQueueInvite): void {
    this.state = {
      ...this.state,
      battleId: invite.battleId,
      expiresAt: undefined,
      phase: "queue_offered",
    };
    this.events.emit({ battleId: invite.battleId, type: "wg_queue_offered" });
  }

  receiveQueueResponse(response: WgQueueResponse): void {
    this.state = {
      ...this.state,
      battleId: response.battleId,
      expiresAt: undefined,
      full: response.full,
      phase: response.queued ? "queued" : "none",
      zone: response.zone,
    };
    this.events.emit({
      battleId: response.battleId,
      queued: response.queued,
      type: "wg_queued",
      zone: response.zone,
    });
  }

  receiveEntryInvite(invite: WgEntryInvite): void {
    this.state = {
      ...this.state,
      battleId: invite.battleId,
      expiresAt: invite.expiresAt,
      phase: "entry_offered",
      zone: invite.zone,
    };
    this.events.emit({
      battleId: invite.battleId,
      expiresAt: invite.expiresAt,
      type: "wg_entry_offered",
    });
  }

  receiveEntered(entered: WgEntered): void {
    this.state = {
      ...this.state,
      battleId: entered.battleId,
      expiresAt: undefined,
      phase: "at_war",
    };
    this.events.emit({ battleId: entered.battleId, type: "wg_entered" });
  }

  receiveEjected(ejected: WgEjected): void {
    const reason =
      LEAVE_REASON_NAMES[ejected.reason] ?? `reason_${ejected.reason}`;
    this.state = {
      ...this.state,
      battleId: ejected.battleId,
      ejectReason: reason,
      expiresAt: undefined,
      phase: "ejected",
    };
    this.events.emit({
      battleId: ejected.battleId,
      reason,
      type: "wg_ejected",
    });
  }

  receiveBuildingDamage(damage: WgBuildingDamage): void {
    this.events.emit({ damage, type: "building_damage" });
  }

  declineOffer(): void {
    this.state = { ...this.state, expiresAt: undefined, phase: "none" };
  }
}
