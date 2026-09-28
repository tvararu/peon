import { ignoreFailure } from "#lib/ignore-failure";
import { parseCharacterLoginFailed } from "#wow/areas/login/protocol";
import type { LoginStore } from "#wow/areas/login/store";
import type { AuthResult } from "#wow/auth";
import type { ClientConfig } from "#wow/client";
import { Arc4 } from "#wow/crypto/arc4";
import { type EntityEvent, EntityStore, isUnit } from "#wow/entity-store";
import { FriendStore } from "#wow/friend-store";
import { GuildStore } from "#wow/guild-store";
import { IgnoreStore } from "#wow/ignore-store";
import { type TraceOutcome, traceIn, traceOut } from "#wow/packet-trace";
import { PartyStore } from "#wow/party-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  AccumulatorBuffer,
  buildOutgoingPacket,
  buildWorldAuthPacket,
  CLASS_NAMES,
  decryptIncomingHeader,
  INCOMING_HEADER_SIZE,
  OpcodeDispatch,
  parseCharacterList,
} from "#wow/protocol/world";
import { RemoteMotion } from "#wow/remote-motion";
import type { Runtimes } from "#wow/runtime";
import { disposeSessionStores, type SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";
import { clearWorldEvents, createWorldEvents } from "#wow/world-events";
import { selfGuid, sendPacket } from "#wow/world-handlers";

function drainWorldPackets(conn: WorldConn): void {
  while (true) {
    if (!conn.pendingHeader) {
      if (conn.buf.length < INCOMING_HEADER_SIZE) break;
      conn.pendingHeader = decryptIncomingHeader(
        conn.buf.drain(INCOMING_HEADER_SIZE),
        conn.arc4,
      );
    }
    const bodySize = conn.pendingHeader.size - 2;
    if (conn.buf.length < bodySize) break;

    const { opcode } = conn.pendingHeader;
    const body = conn.buf.drain(bodySize);
    const at = Date.now();
    let outcome: TraceOutcome = "error";
    conn.pendingHeader = undefined;
    conn.dispatchingOpcode = opcode;
    try {
      outcome = conn.dispatch.handle(opcode, new PacketReader(body));
    } catch (err) {
      if (err instanceof Error) {
        conn.events.packetError.emit(opcode, err);
      }
    } finally {
      flushEntityEvents(conn, opcode);
      conn.dispatchingOpcode = undefined;
      traceIn(conn.trace, { at, body, opcode, outcome });
    }
  }
}

function flushEntityEvents(conn: WorldConn, opcode: number): void {
  const queue = conn.pendingEntityDeliveries;
  for (const deliver of queue) {
    try {
      deliver();
    } catch (err) {
      if (err instanceof Error) conn.events.packetError.emit(opcode, err);
    }
  }
  queue.length = 0;
}

function reportListenerError(conn: WorldConn, error: unknown): void {
  if (conn.dispatchingOpcode === undefined) throw error;
  if (error instanceof Error)
    conn.events.packetError.emit(conn.dispatchingOpcode, error);
}

export async function authenticateWorld(
  conn: WorldConn,
  config: ClientConfig,
  auth: AuthResult,
): Promise<void> {
  const challenge = await conn.dispatch.expect(GameOpcode.SMSG_AUTH_CHALLENGE);
  challenge.uint32LE();
  const serverSeed = challenge.bytes(4);

  const body = buildWorldAuthPacket({
    account: config.account,
    sessionKey: auth.sessionKey,
    serverSeed,
    realmId: auth.realmId,
    clientSeed: config.clientSeed,
  });
  if (!conn.socket) throw new Error("World socket is not connected");
  conn.socket.write(buildOutgoingPacket(GameOpcode.CMSG_AUTH_SESSION, body));
  traceOut(conn.trace, { body, opcode: GameOpcode.CMSG_AUTH_SESSION });
  conn.arc4 = new Arc4(auth.sessionKey);

  await awaitAdmission(conn);
}

const AUTH_OK = 0x0c;
const AUTH_WAIT_QUEUE = 0x1b;
const AUTH_QUEUE_CAP_MS = 600_000;
const AUTH_FAILURES = [
  "failed",
  "rejected",
  "bad server proof",
  "unavailable",
  "system error",
  "billing error",
  "billing expired",
  "version mismatch",
  "unknown account",
  "incorrect password",
  "session expired",
  "server shutting down",
  "already logging in",
  "login server not found",
  "wait queue",
  "banned",
  "already online",
  "no time",
  "db busy",
  "suspended",
  "parental control",
  "locked enforced",
];

function queuePosition(resp: PacketReader): number {
  if (resp.remaining > 5) resp.skip(4 + 1 + 4 + 1);
  return resp.uint32LE();
}

async function awaitAdmission(conn: WorldConn): Promise<void> {
  const deadline = Date.now() + AUTH_QUEUE_CAP_MS;
  let position: number | undefined;
  while (true) {
    const timeoutMs =
      position === undefined ? undefined : Math.max(deadline - Date.now(), 0);
    const resp = await conn.dispatch
      .expect(GameOpcode.SMSG_AUTH_RESPONSE, { timeoutMs })
      .catch((error: unknown) => {
        if (position === undefined) throw error;
        throw new Error(
          `World auth failed: still queued at position ${position} after ${AUTH_QUEUE_CAP_MS / 1000} s`,
        );
      });
    const status = resp.uint8();
    if (status === AUTH_OK) return;
    if (status !== AUTH_WAIT_QUEUE) {
      const label =
        AUTH_FAILURES[status - AUTH_OK - 1] ??
        `status 0x${status.toString(16)}`;
      throw new Error(`World auth failed: ${label}`);
    }
    position = queuePosition(resp);
  }
}

export async function selectCharacter(
  conn: WorldConn,
  stores: Pick<SessionStores, "self">,
  config: ClientConfig,
): Promise<void> {
  sendPacket(conn, GameOpcode.CMSG_CHAR_ENUM);

  const enumReader = await conn.dispatch.expect(GameOpcode.SMSG_CHAR_ENUM);
  const chars = parseCharacterList(enumReader);
  const char = chars.find(
    (c) => c.name.toLowerCase() === config.character.toLowerCase(),
  );
  if (!char) {
    throw new Error(
      `Character "${config.character}" not found. Available: ${chars.map((c) => c.name).join(", ")}`,
    );
  }

  conn.selfName = char.name;
  conn.selfClass = CLASS_NAMES[char.classId];
  conn.selfGuidLow = char.guidLow;
  conn.selfGuidHigh = char.guidHigh;
  conn.guildId = char.guildId;

  const w = new PacketWriter();
  w.uint32LE(char.guidLow);
  w.uint32LE(char.guidHigh);
  const refused = conn.dispatch
    .expect(GameOpcode.SMSG_CHARACTER_LOGIN_FAILED)
    .then((r) => {
      const { reason } = parseCharacterLoginFailed(r);
      throw new Error(`Character login failed: ${reason.replaceAll("_", " ")}`);
    });
  refused.catch(ignoreFailure);
  const loggedIn = stores.self.waitLogin();
  loggedIn.catch(ignoreFailure);
  sendPacket(conn, GameOpcode.CMSG_PLAYER_LOGIN, w.finish());
  await Promise.race([loggedIn, refused]);
}

export function startPingLoop(
  conn: WorldConn,
  login: LoginStore,
  config: Pick<ClientConfig, "pingIntervalMs">,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const { seq, latencyMs } = login.nextPing(Date.now());
    const w = new PacketWriter();
    w.uint32LE(seq);
    w.uint32LE(latencyMs);
    sendPacket(conn, GameOpcode.CMSG_PING, w.finish());
  }, config.pingIntervalMs ?? 30_000);
}

function routeEntityEvent(
  conn: WorldConn,
  stores: SessionStores,
  event: EntityEvent,
): void {
  if (event.type === "disappear") {
    conn.remoteMotion.forget(event.guid);
    stores.motion.forget(event.guid);
    stores.combat.forget(event.guid);
  }
  const deliver = () => deliverEntityEvent(conn, stores, event);
  if (conn.dispatchingOpcode === undefined) deliver();
  else conn.pendingEntityDeliveries.push(deliver);
}

function deliverEntityEvent(
  conn: WorldConn,
  stores: SessionStores,
  event: EntityEvent,
): void {
  stores.recovery.observeEntity(event);
  stores.rewards.observeEntity(event);
  stores.items.observeEntity(event);
  stores.trainer.observe();
  stores.vendor.observeEntity(event);
  stores.destroy.observeInventory();
  conn.events.entity.emit(event);
}

export function createWorldConn(): WorldConn {
  const conn: WorldConn = {
    dispatch: new OpcodeDispatch(),
    buf: new AccumulatorBuffer(),
    startTime: Date.now(),
    nameCache: new Map(),
    pendingMessages: new Map(),
    channels: [],
    lastChatMode: { type: "say" },
    selfName: "",
    selfGuidLow: 0,
    selfGuidHigh: 0,
    partyMembers: new Map(),
    party: new PartyStore(),
    entityStore: new EntityStore(),
    pendingEntityDeliveries: [],
    remoteMotion: new RemoteMotion({
      now: () => Date.now(),
      eligible: (guid) =>
        guid !== selfGuid(conn) &&
        conn.entityStore.get(guid)?.objectType === ObjectType.PLAYER,
      dead: (guid) => {
        const entity = conn.entityStore.get(guid);
        return isUnit(entity) && entity.maxHealth > 0 && entity.health === 0;
      },
      emit: (event) => conn.events.remoteMotion.emit(event),
    }),
    creatureNameCache: new Map(),
    creatureInfoCache: new Map(),
    gameObjectNameCache: new Map(),
    pendingNameQueries: new Set(),
    friendStore: new FriendStore(),
    ignoreStore: new IgnoreStore(),
    guildStore: new GuildStore(),
    guildId: 0,
    pendingRequest: null,
    duelArbiter: 0n,
    events: createWorldEvents((error) => reportListenerError(conn, error)),
    pendingNotices: [],
  };
  conn.friendStore.onEvent((event) => conn.events.friend.emit(event));
  conn.ignoreStore.onEvent((event) => conn.events.ignore.emit(event));
  conn.guildStore.onEvent((event) => conn.events.guild.emit(event));
  return conn;
}

export function routeEntityEvents(
  conn: WorldConn,
  stores: SessionStores,
): void {
  conn.entityStore.onEvent((event) => routeEntityEvent(conn, stores, event));
}

export function cleanupSession(
  conn: WorldConn,
  session: { stores: SessionStores; rt: Runtimes },
  sendStop: boolean,
): void {
  clearWorldEvents(conn.events);
  session.rt.dispose(sendStop);
  disposeSessionStores(session.stores);
}
export function connectWorld(
  conn: WorldConn,
  auth: AuthResult,
  hooks: { close: () => void; reject: (error: unknown) => void },
): void {
  Bun.connect({
    hostname: auth.realmHost,
    port: auth.realmPort,
    socket: {
      open(s) {
        conn.socket = s;
      },
      data(_s, data) {
        conn.buf.append(new Uint8Array(data));
        drainWorldPackets(conn);
      },
      close() {
        hooks.close();
      },
    },
  }).catch(hooks.reject);
}
