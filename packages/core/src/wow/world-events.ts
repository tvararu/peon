import { Emitter } from "#lib/emitter";
import { ignoreFailure } from "#lib/ignore-failure";
import type { ChatMessage, DuelEvent, GroupEvent } from "#wow/client";
import type { NoticeEvent } from "#wow/client-extras";
import type { CombatEvent } from "#wow/combat";
import type { ControlEvent } from "#wow/control";
import type { DestroyEvent } from "#wow/destroy";
import type { EntityEvent } from "#wow/entity-store";
import type { FriendEvent } from "#wow/friend-store";
import type { GuildEvent } from "#wow/guild-store";
import type { IgnoreEvent } from "#wow/ignore-store";
import type { QuestEvent } from "#wow/quests";
import type { RecoveryEvent } from "#wow/recovery";
import type { RemoteMotionEvent } from "#wow/remote-motion";
import type { RewardsEvent } from "#wow/rewards";
import type { TrainerEvent } from "#wow/trainer";
import type { VendorEvent } from "#wow/vendor";

export type WorldEvents = {
  message: Emitter<[ChatMessage]>;
  group: Emitter<[GroupEvent]>;
  entity: Emitter<[EntityEvent]>;
  packetError: Emitter<[number, Error]>;
  friend: Emitter<[FriendEvent]>;
  ignore: Emitter<[IgnoreEvent]>;
  guild: Emitter<[GuildEvent]>;
  duel: Emitter<[DuelEvent]>;
  control: Emitter<[ControlEvent]>;
  combat: Emitter<[CombatEvent]>;
  recovery: Emitter<[RecoveryEvent]>;
  quest: Emitter<[QuestEvent]>;
  rewards: Emitter<[RewardsEvent]>;
  remoteMotion: Emitter<[RemoteMotionEvent]>;
  trainer: Emitter<[TrainerEvent]>;
  vendor: Emitter<[VendorEvent]>;
  destroy: Emitter<[DestroyEvent]>;
  notice: Emitter<[NoticeEvent]>;
};

export function createWorldEvents(
  report?: (error: unknown) => void,
): WorldEvents {
  return {
    message: new Emitter(report),
    group: new Emitter(report),
    entity: new Emitter(report),
    packetError: new Emitter(ignoreFailure),
    friend: new Emitter(report),
    ignore: new Emitter(report),
    guild: new Emitter(report),
    duel: new Emitter(report),
    control: new Emitter(report),
    combat: new Emitter(report),
    recovery: new Emitter(report),
    quest: new Emitter(report),
    rewards: new Emitter(report),
    remoteMotion: new Emitter(report),
    trainer: new Emitter(report),
    vendor: new Emitter(report),
    destroy: new Emitter(report),
    notice: new Emitter(report),
  };
}

export function clearWorldEvents(events: WorldEvents): void {
  for (const emitter of Object.values(events)) emitter.clear();
}
