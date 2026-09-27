import { jest } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import type {
  ChatMessage,
  ChatMode,
  DuelEvent,
  GroupEvent,
  WorldHandle,
} from "#wow/client";
import type { NoticeEvent } from "#wow/client-extras";
import { type CombatEvent, CombatRuntime } from "#wow/combat";
import type { ControlEvent, ControlState } from "#wow/control";
import type { Entity, EntityEvent } from "#wow/entity-store";
import type { FriendEntry, FriendEvent } from "#wow/friend-store";
import type { GuildEvent, GuildRoster } from "#wow/guild-store";
import type { IgnoreEntry, IgnoreEvent } from "#wow/ignore-store";
import { labelInventory, labelRewards } from "#wow/item-labels";
import { type NearbyQuery, queryNearby } from "#wow/nearby";
import { PartyStore } from "#wow/party-store";
import { type QuestEvent, QuestRuntime } from "#wow/quests";
import { type RecoveryEvent, RecoveryRuntime } from "#wow/recovery";
import type { RemotePose } from "#wow/remote-motion";
import { type RewardsEvent, RewardsRuntime } from "#wow/rewards";
import type { TrainerEvent } from "#wow/trainer";
import { type VendorEvent, VendorRuntime } from "#wow/vendor";
import { createWorldEvents } from "#wow/world-events";

export type MockHandle = WorldHandle & {
  triggerMessage: (msg: ChatMessage) => void;
  triggerGroupEvent: (event: GroupEvent) => void;
  triggerDuelEvent: (event: DuelEvent) => void;
  triggerEntityEvent: (event: EntityEvent) => void;
  triggerFriendEvent: (event: FriendEvent) => void;
  triggerIgnoreEvent: (event: IgnoreEvent) => void;
  triggerGuildEvent: (event: GuildEvent) => void;
  triggerControlEvent: (event: ControlEvent) => void;
  triggerCombatEvent: (event: CombatEvent) => void;
  triggerRecoveryEvent: (event: RecoveryEvent) => void;
  triggerQuestEvent: (event: QuestEvent) => void;
  triggerRewardsEvent: (event: RewardsEvent) => void;
  triggerVendorEvent: (event: VendorEvent) => void;
  triggerNotice: (event: NoticeEvent) => void;
  triggerTrainerEvent: (event: TrainerEvent) => void;
  resolveClosed: () => void;
};

export function createMockHandle(): MockHandle {
  const controlState: ControlState = {
    blockedReason: undefined,
    direction: undefined,
    movementAllowed: true,
    moving: false,
    owner: "none",
    pose: undefined,
    requestedTarget: undefined,
    selfGuid: 0n,
    serverPose: undefined,
    speed: 0,
    target: undefined,
  };
  const runtimeDeps = {
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => 0n,
    send: () => {},
  };
  const stores = testStores(runtimeDeps);
  const combat = new CombatRuntime(stores, {
    ...runtimeDeps,
    selectedGuid: () => undefined,
    selfPose: () => undefined,
  });
  const recovery = new RecoveryRuntime(stores.recovery, {
    ...runtimeDeps,
    pose: () => undefined,
  });
  const quests = new QuestRuntime(stores.quests, runtimeDeps);
  const rewards = new RewardsRuntime(stores.rewards, runtimeDeps);
  const vendor = new VendorRuntime(stores.vendor, runtimeDeps);
  const unanswered = () => ({ name: null, quality: null });

  const events = createWorldEvents();
  let closeResolve: () => void;
  const closed = new Promise<void>((r) => {
    closeResolve = r;
  });
  let lastChatMode: ChatMode = { type: "say" };

  const handle: MockHandle = {
    abandonLoot: jest.fn(),
    abandonQuest: jest.fn(),
    acceptGuildInvite: jest.fn(),
    acceptInvite: jest.fn(),
    acceptQuest: jest.fn(),
    activateSpiritHealer: jest.fn(),
    addFriend: jest.fn(),
    addIgnore: jest.fn(),
    attack: jest.fn(),
    buyItem: jest.fn(),
    cancelCast: jest.fn(),
    cancelInteraction: jest.fn(),
    capabilities: jest.fn(() => ({
      factions: false,
      spells: false,
    })),
    cast: jest.fn(),
    chooseQuestReward: jest.fn(),
    close: jest.fn(() => closeResolve()),
    closed,
    completeQuest: jest.fn(),
    declineGuildInvite: jest.fn(),
    declineInvite: jest.fn(),
    destroyItem: jest.fn(),
    face: jest.fn(),
    faceGuid: jest.fn(),
    follow: jest.fn(),
    getChannel: jest.fn(),
    getCombatState: jest.fn(() => combat.snapshot()),
    getControlState: jest.fn((): ControlState => controlState),
    getCreatureInfo: jest.fn(() => undefined),
    getDestroyState: jest.fn(() => ({
      lastOutcome: undefined,
      pending: undefined,
    })),
    getEntity: jest.fn((): Entity | undefined => undefined),
    getExperienceState: jest.fn(() => ({
      lastLevelUp: undefined,
      lastXp: undefined,
      level: undefined,
      nextLevelXp: undefined,
      xp: undefined,
    })),
    getFriends: jest.fn((): FriendEntry[] => []),
    getIgnored: jest.fn((): IgnoreEntry[] => []),
    getInventoryState: jest.fn(() =>
      labelInventory(rewards.snapshot().inventory, unanswered),
    ),
    getItemTemplate: jest.fn(async () => undefined),
    getLastChatMode: jest.fn(() => lastChatMode),
    getNearbyEntities: jest.fn((): Entity[] => []),
    getPartyState: jest.fn(() => new PartyStore().snapshot()),
    getPlaceState: jest.fn(() => ({
      area: undefined,
      areaId: undefined,
      at: undefined,
      mapId: undefined,
      zone: undefined,
      zoneId: undefined,
    })),
    getQuestState: jest.fn(() => quests.snapshot()),
    getRecoveryState: jest.fn(() => recovery.snapshot()),
    getRemotePoses: jest.fn((): RemotePose[] => []),
    getReplyTarget: jest.fn((): string | undefined => undefined),
    getRewardsState: jest.fn(() =>
      labelRewards(rewards.snapshot(), unanswered),
    ),
    getSelfClass: jest.fn((): string | undefined => undefined),
    getSpellbook: jest.fn(async () => []),
    getTrainerState: jest.fn(async () => ({
      coinage: undefined,
      lastOutcome: undefined,
      level: undefined,
      offer: undefined,
      pending: undefined,
    })),
    getVendorState: jest.fn(() => ({
      ...vendor.snapshot(),
      window: undefined,
    })),
    guildDemote: jest.fn(),
    guildInvite: jest.fn(),
    guildLeader: jest.fn(),
    guildLeave: jest.fn(),
    guildMotd: jest.fn(),
    guildPromote: jest.fn(),
    guildRemove: jest.fn(),
    halt: jest.fn(),
    invite: jest.fn(),
    isAttackingSelf: jest.fn(() => false),
    itemLabel: jest.fn(unanswered),
    joinChannel: jest.fn(),
    leaveChannel: jest.fn(),
    leaveGroup: jest.fn(),
    loadCatalogs: jest.fn(async () => {}),
    logout: jest.fn(() => closeResolve()),
    move: jest.fn(),
    observedPosition: jest.fn((): never => {
      throw new Error("target_not_observed");
    }),
    onCombatEvent(cb) {
      return events.combat.subscribe(cb);
    },
    onControlEvent(cb) {
      return events.control.subscribe(cb);
    },
    onDestroyEvent(cb) {
      return events.destroy.subscribe(cb);
    },
    onDuelEvent(cb) {
      return events.duel.subscribe(cb);
    },
    onEntityEvent(cb) {
      return events.entity.subscribe(cb);
    },
    onFriendEvent(cb) {
      return events.friend.subscribe(cb);
    },
    onGroupEvent(cb) {
      return events.group.subscribe(cb);
    },
    onGuildEvent(cb) {
      return events.guild.subscribe(cb);
    },
    onIgnoreEvent(cb) {
      return events.ignore.subscribe(cb);
    },
    onMessage(cb) {
      return events.message.subscribe(cb);
    },
    onMovementStop: jest.fn(() => () => {}),
    onNotice(cb) {
      return events.notice.subscribe(cb);
    },
    onPacketError: jest.fn((cb: (opcode: number, err: Error) => void) =>
      events.packetError.subscribe(cb),
    ),
    onQuestEvent(cb) {
      return events.quest.subscribe(cb);
    },
    onRecoveryEvent(cb) {
      return events.recovery.subscribe(cb);
    },
    onRemoteMotionEvent(cb) {
      return events.remoteMotion.subscribe(cb);
    },
    onRewardsEvent(cb) {
      return events.rewards.subscribe(cb);
    },
    onTrainerEvent(cb) {
      return events.trainer.subscribe(cb);
    },
    onVendorEvent(cb) {
      return events.vendor.subscribe(cb);
    },
    openLoot: jest.fn(),
    openTrainer: jest.fn(),
    openVendor: jest.fn(),
    petAttack: jest.fn(),
    queryCorpse: jest.fn(),
    queryNearby: jest.fn((query?: NearbyQuery) =>
      queryNearby(
        {
          control: handle.getControlState(),
          entities: handle.getNearbyEntities(),
          now: Date.now(),
          observedPosition: (guid) => combat.observedPosition(guid),
          remotePoses: handle.getRemotePoses(),
          units: {
            attackingMe: (guid) =>
              handle.getCombatState().attackers?.includes(guid) === true,
            relation: () => "unknown",
          },
        },
        query,
      ),
    ),
    queryQuest: jest.fn(),
    reclaimCorpse: jest.fn(),
    releaseLoot: jest.fn(),
    releaseSpirit: jest.fn(),
    removeFriend: jest.fn(),
    removeIgnore: jest.fn(),
    repairAll: jest.fn(),
    requestGuildRoster: jest.fn(
      async (): Promise<GuildRoster | undefined> => undefined,
    ),
    requestQuestReward: jest.fn(),
    resolveClosed() {
      closeResolve();
    },
    respondResurrection: jest.fn(),
    rollLoot: jest.fn(),
    selectGossipOption: jest.fn(),
    selectQuest: jest.fn(),
    selectTarget: jest.fn(),
    sellItem: jest.fn(),
    sendAfk: jest.fn(),
    sendChannel: jest.fn(),
    sendDnd: jest.fn(),
    sendEmote: jest.fn(),
    sendGuild: jest.fn(),
    sendInCurrentMode: jest.fn(),
    sendOfficer: jest.fn(),
    sendParty: jest.fn(),
    sendRaid: jest.fn(),
    sendRoll: jest.fn(),
    sendSay: jest.fn(),
    sendWhisper: jest.fn(),
    sendYell: jest.fn(),
    setControlLease: jest.fn(),
    setLastChatMode: jest.fn((mode: ChatMode) => {
      lastChatMode = mode;
    }),
    setLeader: jest.fn(),
    spellDefinition: jest.fn(() => undefined),
    spellReadyAt: jest.fn(() => 0),
    stopAttack: jest.fn(),
    stopAutoRepeat: jest.fn(),
    stopCombat: jest.fn(),
    stopMoving: jest.fn(),
    takeLoot: jest.fn(),
    takeLootMoney: jest.fn(),
    talk: jest.fn(),
    trainSpell: jest.fn(),
    triggerCombatEvent(event) {
      events.combat.emit(event);
    },
    triggerControlEvent(event) {
      events.control.emit(event);
    },
    triggerDuelEvent(event) {
      events.duel.emit(event);
    },
    triggerEntityEvent(event) {
      events.entity.emit(event);
    },
    triggerFriendEvent(event) {
      events.friend.emit(event);
    },
    triggerGroupEvent(event) {
      events.group.emit(event);
    },
    triggerGuildEvent(event) {
      events.guild.emit(event);
    },
    triggerIgnoreEvent(event) {
      events.ignore.emit(event);
    },
    triggerMessage(msg) {
      events.message.emit(msg);
    },
    triggerNotice(event) {
      events.notice.emit(event);
    },
    triggerQuestEvent(event) {
      events.quest.emit(event);
    },
    triggerRecoveryEvent(event) {
      events.recovery.emit(event);
    },
    triggerRewardsEvent(event) {
      events.rewards.emit(event);
    },
    triggerTrainerEvent(event) {
      events.trainer.emit(event);
    },
    triggerVendorEvent(event) {
      events.vendor.emit(event);
    },
    uninvite: jest.fn(),
    unitRelation: jest.fn(() => "unknown" as const),
    useItem: jest.fn(async () => {}),
    walkTowardPoint: jest.fn(async () => {
      throw new Error("mock_walk_unavailable");
    }),
    who: jest.fn(async () => []),
  };
  return handle;
}
