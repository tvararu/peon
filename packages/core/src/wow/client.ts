import type { Unsubscribe } from "#lib/emitter";
import { ignoreFailure } from "#lib/ignore-failure";
import { actionBarMethods } from "#wow/action-bar";
import {
  type AreaEvent,
  type AreaHandles,
  areaHandles,
} from "#wow/areas/compose";
import { channelMethods, chatMethods } from "#wow/client-chat";
import {
  authenticateWorld,
  cleanupSession,
  connectWorld,
  createWorldConn,
  routeEntityEvents,
  selectCharacter,
  startPingLoop,
} from "#wow/client-connection";
import { controlMethods } from "#wow/client-control";
import {
  type Capabilities,
  type CreatureInfo,
  extrasMethods,
  type NoticeEvent,
} from "#wow/client-extras";
import {
  combatMethods,
  questMethods,
  questRewardMethods,
  recoveryMethods,
  rewardsMethods,
} from "#wow/client-gameplay";
import { registerWorldHandlers } from "#wow/client-handlers";
import { type PlaceState, placeMethods } from "#wow/client-place";
import {
  groupMethods,
  guildMethods,
  ignoreMethods,
  socialMethods,
} from "#wow/client-social";
import { type NamedTrainerState, trainerMethods } from "#wow/client-trainer";
import { type NamedVendorState, vendorMethods } from "#wow/client-vendor";
import type { CombatEvent, CombatState } from "#wow/combat";
import type { ControlEvent, ControlState, WalkOutcome } from "#wow/control";
import type { MovementDirection, MovementInput } from "#wow/control-input";
import type { GroundOracle } from "#wow/control-motion";
import type { MovementGuide } from "#wow/control-mover";
import type { DbcSource } from "#wow/dbc";
import type { DestroyEvent, DestroyState } from "#wow/destroy";
import type { Entity, EntityEvent } from "#wow/entity-store";
import type { ExperienceState } from "#wow/experience";
import type { FactionRelation } from "#wow/faction-template";
import type { FriendEntry, FriendEvent } from "#wow/friend-store";
import type { NavPoint } from "#wow/ground-step";
import type { GuildEvent, GuildRoster } from "#wow/guild-store";
import type { IgnoreEntry, IgnoreEvent } from "#wow/ignore-store";
import type {
  ItemLabel,
  NamedInventoryState,
  NamedRewardsState,
} from "#wow/item-labels";
import { LOGOUT_TIMEOUT_MS, requestLogout } from "#wow/logout";
import type { NearbyQuery, NearbyRow } from "#wow/nearby";
import { closeTap, createTap, type TraceSink } from "#wow/packet-trace";
import type { PartyChange, PartyLoot, PartyState } from "#wow/party-store";
import type { ActionButton } from "#wow/protocol/action-buttons";
import type { WhoResult } from "#wow/protocol/chat";
import { Language } from "#wow/protocol/enums";
import type { ItemTemplate } from "#wow/protocol/item";
import type { RollVote } from "#wow/protocol/loot";
import type { QuestEvent, QuestState } from "#wow/quests";
import type { RecoveryEvent, RecoveryState } from "#wow/recovery";
import type { RemoteMotionEvent, RemotePose } from "#wow/remote-motion";
import type { RewardsEvent } from "#wow/rewards";
import { createRuntimes, type Runtimes } from "#wow/runtime";
import { createSessionStores, type SessionStores } from "#wow/session-stores";
import type { SpellDefinition } from "#wow/spell-catalog";
import type { TrainerEvent } from "#wow/trainer";
import type { VendorEvent } from "#wow/vendor";
import type { WorldConn } from "#wow/world-conn";
import { sendPacket } from "#wow/world-handlers";

export type ClientConfig = {
  host: string;
  port: number;
  account: string;
  password: string;
  character: string;
  srpPrivateKey?: bigint;
  clientSeed?: Uint8Array;
  pingIntervalMs?: number;
  logoutTimeoutMs?: number;
  language?: number;
  cachedSessionKey?: Uint8Array;
  dbc?: DbcSource;
  ground?: GroundOracle;
  trace?: TraceSink;
};

import type { AuthResult } from "#wow/auth";

export type ChatMessage = {
  type: number;
  sender: string;
  message: string;
  channel?: string;
  origin?: "server" | "notification" | "mail";
};

export type GroupEvent =
  | { type: "invite_received"; from: string }
  | {
      type: "command_result";
      operation: number;
      target: string;
      result: number;
    }
  | { type: "leader_changed"; name: string }
  | {
      type: "group_list";
      members: Array<{
        name: string;
        guidLow: number;
        guidHigh: number;
        online: boolean;
      }>;
      leader: string;
      change: PartyChange;
      loot: PartyLoot | null;
    }
  | { type: "group_destroyed" }
  | { type: "kicked" }
  | { type: "invite_declined"; name: string }
  | {
      type: "member_stats";
      guidLow: number;
      online?: boolean;
      hp?: number;
      maxHp?: number;
      level?: number;
    };

export type DuelEvent =
  | { type: "duel_requested"; challenger: string }
  | { type: "duel_countdown"; timeMs: number }
  | { type: "duel_complete"; completed: boolean }
  | {
      type: "duel_winner";
      reason: "won" | "fled";
      winner: string;
      loser: string;
    }
  | { type: "duel_out_of_bounds" }
  | { type: "duel_in_bounds" };

export type { Entity, EntityEvent } from "#wow/entity-store";
export type { FriendEntry, FriendEvent } from "#wow/friend-store";
export type { GuildEvent, GuildRoster } from "#wow/guild-store";
export type { IgnoreEntry, IgnoreEvent } from "#wow/ignore-store";
export type { WhoResult } from "#wow/protocol/chat";

export type ChatMode =
  | { type: "say" }
  | { type: "yell" }
  | { type: "guild" }
  | { type: "officer" }
  | { type: "party" }
  | { type: "raid" }
  | { type: "emote" }
  | { type: "whisper"; target: string }
  | { type: "channel"; channel: string };

export type CoreHandle = {
  closed: Promise<void>;
  close: () => void;
  logout: () => void;
  onMessage: (cb: (msg: ChatMessage) => void) => Unsubscribe;
  sendWhisper: (target: string, message: string) => void;
  sendSay: (message: string) => void;
  sendYell: (message: string) => void;
  sendGuild: (message: string) => void;
  sendOfficer: (message: string) => void;
  sendParty: (message: string) => void;
  sendRaid: (message: string) => void;
  sendEmote: (message: string) => void;
  sendDnd: (message: string) => void;
  sendAfk: (message: string) => void;
  sendChannel: (channel: string, message: string) => void;
  getChannel: (index: number) => string | undefined;
  getReplyTarget: () => string | undefined;
  who: (opts?: {
    name?: string;
    minLevel?: number;
    maxLevel?: number;
  }) => Promise<WhoResult[]>;
  getLastChatMode: () => ChatMode;
  setLastChatMode: (mode: ChatMode) => void;
  sendInCurrentMode: (message: string) => void;
  invite: (name: string) => void;
  uninvite: (name: string) => void;
  leaveGroup: () => void;
  joinChannel: (name: string, password?: string) => void;
  leaveChannel: (name: string) => void;
  setLeader: (name: string) => void;
  acceptInvite: () => void;
  declineInvite: () => void;
  onGroupEvent: (cb: (event: GroupEvent) => void) => Unsubscribe;
  getPartyState: () => PartyState;
  onEntityEvent: (cb: (event: EntityEvent) => void) => Unsubscribe;
  onPacketError: (cb: (opcode: number, err: Error) => void) => Unsubscribe;
  getNearbyEntities: () => Entity[];
  getEntity: (guid: bigint) => Entity | undefined;
  getFriends: () => FriendEntry[];
  addFriend: (name: string) => void;
  removeFriend: (name: string) => void;
  sendRoll: (min: number, max: number) => void;
  onFriendEvent: (cb: (event: FriendEvent) => void) => Unsubscribe;
  getIgnored: () => IgnoreEntry[];
  addIgnore: (name: string) => void;
  removeIgnore: (name: string) => void;
  onIgnoreEvent: (cb: (event: IgnoreEvent) => void) => Unsubscribe;
  requestGuildRoster: () => Promise<GuildRoster | undefined>;
  onGuildEvent: (cb: (event: GuildEvent) => void) => Unsubscribe;
  onDuelEvent: (cb: (event: DuelEvent) => void) => Unsubscribe;
  guildInvite: (name: string) => void;
  guildRemove: (name: string) => void;
  guildLeave: () => void;
  guildPromote: (name: string) => void;
  guildDemote: (name: string) => void;
  guildLeader: (name: string) => void;
  guildMotd: (motd: string) => void;
  acceptGuildInvite: () => void;
  declineGuildInvite: () => void;
  getControlState: () => ControlState;
  move: (direction: MovementDirection, durationMs: number) => void;
  drive: (input: MovementInput, durationMs: number) => void;
  jump: () => void;
  face: (orientation: number) => void;
  faceGuid: (guid: bigint) => void;
  walkTowardPoint: (
    target: NavPoint,
    yards: number,
    signal?: AbortSignal,
  ) => Promise<WalkOutcome>;
  selectTarget: (guid: bigint) => void;
  stopMoving: (reason?: string) => void;
  observedPosition: (guid: bigint) => NavPoint;
  unitRelation: (guid: bigint) => FactionRelation;
  halt: () => void;
  onControlEvent: (cb: (event: ControlEvent) => void) => Unsubscribe;
  getRemotePoses: () => RemotePose[];
  queryNearby: (query?: NearbyQuery) => NearbyRow[];
  onRemoteMotionEvent: (cb: (event: RemoteMotionEvent) => void) => Unsubscribe;
  getCombatState: (targetGuid?: bigint) => CombatState;
  getSpellbook: () => Promise<SpellDefinition[]>;
  loadCatalogs: () => Promise<void>;
  spellDefinition: (spellId: number) => SpellDefinition | undefined;
  spellReadyAt: (spellId: number) => number;
  isAttackingSelf: (guid: bigint) => boolean;
  getSelfClass: () => string | undefined;
  cast: (spellId: number, targetGuid: bigint) => void;
  attack: (targetGuid: bigint) => void;
  cancelCast: () => void;
  stopAttack: () => void;
  stopAutoRepeat: () => void;
  petAttack: (petGuid: bigint, targetGuid: bigint) => void;
  stopCombat: () => void;
  follow: (guide: MovementGuide, facing: number, durationMs: number) => void;
  onMovementStop: (cb: (reason: string) => void) => Unsubscribe;
  onCombatEvent: (cb: (event: CombatEvent) => void) => Unsubscribe;
  getRecoveryState: () => RecoveryState;
  queryCorpse: () => void;
  releaseSpirit: () => void;
  reclaimCorpse: () => void;
  activateSpiritHealer: (guid: bigint) => void;
  respondResurrection: (accept: boolean) => void;
  onRecoveryEvent: (cb: (event: RecoveryEvent) => void) => Unsubscribe;
  getQuestState: () => QuestState;
  talk: (guid: bigint) => void;
  queryQuest: (questId: number) => void;
  selectGossipOption: (optionId: number, code?: string) => void;
  selectQuest: (questId: number) => void;
  acceptQuest: () => void;
  completeQuest: (questId: number) => void;
  requestQuestReward: () => void;
  chooseQuestReward: (index: number) => void;
  abandonQuest: (slot: number) => void;
  cancelInteraction: () => void;
  onQuestEvent: (cb: (event: QuestEvent) => void) => Unsubscribe;
  getInventoryState: () => NamedInventoryState;
  getExperienceState: () => ExperienceState;
  getRewardsState: () => NamedRewardsState;
  itemLabel: (entry: number) => ItemLabel;
  openLoot: (guid: bigint) => void;
  takeLoot: (slot: number) => void;
  takeLootMoney: () => void;
  releaseLoot: () => void;
  abandonLoot: () => void;
  getItemTemplate: (entry: number) => Promise<ItemTemplate | undefined>;
  useItem: (bag: number, slot: number) => Promise<void>;
  rollLoot: (guid: bigint, slot: number, vote: RollVote) => void;
  onRewardsEvent: (cb: (event: RewardsEvent) => void) => Unsubscribe;
  destroyItem: (bag: number, slot: number, count?: number) => void;
  getDestroyState: () => DestroyState;
  onDestroyEvent: (cb: (event: DestroyEvent) => void) => Unsubscribe;
  getTrainerState: () => Promise<NamedTrainerState>;
  openTrainer: (guid: bigint) => void;
  trainSpell: (spellId: number) => void;
  onTrainerEvent: (cb: (event: TrainerEvent) => void) => Unsubscribe;
  getVendorState: () => NamedVendorState;
  openVendor: (guid: bigint) => void;
  sellItem: (bag: number, slot: number, count?: number) => void;
  buyItem: (slot: number, count?: number) => void;
  repairAll: () => void;
  onVendorEvent: (cb: (event: VendorEvent) => void) => Unsubscribe;
  capabilities: () => Capabilities;
  getPlaceState: () => PlaceState;
  getActionBar: () => ActionButton[];
  onNotice: (cb: (event: NoticeEvent) => void) => Unsubscribe;
  getCreatureInfo: (entry: number) => CreatureInfo | undefined;
};

export type WorldHandle = CoreHandle &
  AreaHandles & {
    onAreaEvent: (cb: (event: AreaEvent) => void) => Unsubscribe;
  };

type SessionHandle = {
  conn: WorldConn;
  stores: SessionStores;
  rt: Runtimes;
  lang: number;
  lifecycle: Pick<WorldHandle, "closed" | "close" | "logout">;
};

function createHandle(session: SessionHandle): WorldHandle {
  const { conn, stores, rt, lang, lifecycle } = session;
  const handle: WorldHandle = {
    ...lifecycle,
    onMessage(cb) {
      return conn.events.message.subscribe(cb);
    },
    ...chatMethods(conn, lang),
    ...channelMethods(conn, () => handle),
    ...groupMethods(conn),
    ...socialMethods(conn),
    ...ignoreMethods(conn),
    ...guildMethods(conn),
    ...controlMethods(conn, rt),
    ...combatMethods(conn, rt),
    ...recoveryMethods(conn, rt),
    ...questMethods(conn, rt),
    ...questRewardMethods(rt),
    ...rewardsMethods(conn, rt),
    ...trainerMethods(conn, rt),
    ...vendorMethods(conn, rt),
    ...placeMethods(stores),
    ...actionBarMethods(stores),
    ...extrasMethods(conn, rt),
    ...areaHandles(stores.areas, rt.areas.runtimes, () => conn.events.area),
    onAreaEvent(cb) {
      return conn.events.area.subscribe(cb);
    },
  };
  return handle;
}

export function worldSession(
  config: ClientConfig,
  auth: AuthResult,
): Promise<WorldHandle> {
  return new Promise((resolve, reject) => {
    const conn = createWorldConn();
    conn.trace = createTap(config.trace);
    const stores = createSessionStores(conn);
    routeEntityEvents(conn, stores);
    const rt = createRuntimes(conn, stores, config);
    const session = { stores, rt };
    let pingInterval: ReturnType<typeof setInterval> | undefined;
    let done = false;
    const { promise: closed, resolve: closedResolve } =
      Promise.withResolvers<void>();
    registerWorldHandlers(conn, stores);

    async function login(): Promise<void> {
      await authenticateWorld(conn, config, auth);
      await selectCharacter(conn, stores, config);
      pingInterval = startPingLoop(conn, config.pingIntervalMs ?? 30_000);
      const lang = config.language ?? Language.COMMON;
      done = true;
      config.trace?.attach?.((opcode, body) => sendPacket(conn, opcode, body));
      const close = (): void => {
        clearInterval(pingInterval);
        cleanupSession(conn, session, true);
        conn.socket?.end();
      };
      let loggingOut = false;
      const logout = (): void => {
        if (loggingOut) return;
        loggingOut = true;
        cleanupSession(conn, session, true);
        const timeoutMs = config.logoutTimeoutMs ?? LOGOUT_TIMEOUT_MS;
        requestLogout(conn, closed, timeoutMs).then(close).catch(ignoreFailure);
      };
      const lifecycle = { close, closed, logout };
      resolve(createHandle({ conn, stores, lang, lifecycle, rt }));
    }

    login().catch((err) => {
      done = true;
      clearInterval(pingInterval);
      reject(err);
      cleanupSession(conn, session, false);
      conn.socket?.end();
    });

    connectWorld(conn, auth, {
      close() {
        clearInterval(pingInterval);
        cleanupSession(conn, session, false);
        conn.entityStore.clear();
        closeTap(conn.trace, conn.dispatch);
        if (!done) reject(new Error("World connection closed"));
        closedResolve();
      },
      reject,
    });
  });
}
