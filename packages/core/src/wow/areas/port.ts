import type { LegacyViews } from "#wow/areas/contract";
import type { DbcSource } from "#wow/dbc";
import { isUnit } from "#wow/entity-store";
import type { PacketReader } from "#wow/protocol/packet";
import type { ExpectOptions } from "#wow/protocol/world";
import { sessionDeps } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents, type WorldEvents } from "#wow/world-events";

export type AreaPort = {
  send: (opcode: number, body?: Uint8Array) => void;
  expect: (opcode: number, options?: ExpectOptions) => Promise<PacketReader>;
  events: () => WorldEvents;
  now: () => number;
  selfGuid: () => bigint;
  dbc: DbcSource | undefined;
  legacy: LegacyViews;
};
export type SentPacket = { readonly opcode: number; readonly body: Uint8Array };
export type TestPort = AreaPort & { readonly sent: SentPacket[] };

function legacyViews(conn: WorldConn): LegacyViews {
  return {
    party: () =>
      conn.party.snapshot((guid) => {
        const entity = conn.entityStore.get(guid);
        if (!isUnit(entity) || entity.maxHealth === 0) return;
        const { health, maxHealth, level } = entity;
        return { health, level, maxHealth };
      }, Date.now()),
    friends: () => conn.friendStore.all(),
    ignored: () => conn.ignoreStore.all(),
    guild: () => conn.guildStore.get(),
    channels: () => [...conn.channels],
  };
}

export function areaPort(
  conn: WorldConn,
  dbc: DbcSource | undefined,
): AreaPort {
  const deps = sessionDeps(conn);
  return {
    send: (opcode, body) => deps.send(opcode, body),
    expect: (opcode, options) => conn.dispatch.expect(opcode, options),
    events: () => conn.events,
    now: () => deps.now(),
    selfGuid: () => deps.selfGuid(),
    dbc,
    legacy: legacyViews(conn),
  };
}

const EMPTY_LEGACY: LegacyViews = {
  party: () => ({
    counter: 0,
    difficulty: undefined,
    dungeonFinder: undefined,
    inGroup: false,
    kind: "party",
    leader: null,
    loot: null,
    members: [],
    ownFlags: 0,
    ownRoles: 0,
    ownSubgroup: 0,
  }),
  friends: () => [],
  ignored: () => [],
  guild: () => undefined,
  channels: () => [],
};

export function testPort(init: Partial<AreaPort> = {}): TestPort {
  const sent: SentPacket[] = [];
  const events = createWorldEvents();
  return {
    send: (opcode, body = new Uint8Array()) => {
      sent.push({ opcode, body });
    },
    expect: () => Promise.reject(new Error("no server")),
    events: () => events,
    now: () => 0,
    selfGuid: () => 0n,
    dbc: undefined,
    legacy: EMPTY_LEGACY,
    ...init,
    sent,
  };
}
