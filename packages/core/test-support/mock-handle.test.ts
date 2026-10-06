import { expect, jest, test } from "bun:test";
import type { AreaEvent } from "#wow/areas/compose";
import { TIME_QUERY_TIMEOUT_MS } from "#wow/areas/time/runtime";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { createMockHandle } from "./mock-handle";

test("resolveClosed resolves closed promise", async () => {
  const handle = createMockHandle();
  handle.resolveClosed();
  await expect(handle.closed).resolves.toBeUndefined();
});

test("close resolves closed promise", async () => {
  const handle = createMockHandle();
  handle.close();
  await expect(handle.closed).resolves.toBeUndefined();
});

test("setLastChatMode updates getLastChatMode", () => {
  const handle = createMockHandle();
  handle.setLastChatMode({ target: "Xiara", type: "whisper" });
  expect(handle.getLastChatMode()).toEqual({
    target: "Xiara",
    type: "whisper",
  });
});

test("triggerMessage forwards to onMessage callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onMessage((msg) => {
    seen = `${msg.sender}:${msg.message}`;
  });
  handle.triggerMessage({ message: "hi", sender: "Alice", type: 0 });
  expect(seen).toBe("Alice:hi");
});

test("triggerGroupEvent forwards to onGroupEvent callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onGroupEvent((event) => {
    seen = event.type;
  });
  handle.triggerGroupEvent({ type: "group_destroyed" });
  expect(seen).toBe("group_destroyed");
});

test("triggerFriendEvent forwards to onFriendEvent callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onFriendEvent((event) => {
    seen = event.type;
  });
  handle.triggerFriendEvent({ friends: [], type: "friend-list" });
  expect(seen).toBe("friend-list");
});

test("triggerEntityEvent forwards to onEntityEvent callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onEntityEvent((event) => {
    seen = event.type;
  });
  handle.triggerEntityEvent({
    entity: {
      class_: 0,
      displayId: 0,
      entry: 0,
      factionTemplate: 0,
      gender: 0,
      guid: 1n,
      health: 100,
      level: 10,
      maxHealth: 100,
      maxPower: [],
      name: "NPC",
      npcFlags: 0,
      objectType: ObjectType.UNIT,
      position: undefined,
      power: [],
      race: 0,
      rawFields: new Map(),
      scale: 1,
      target: 0n,
      unitFlags: 0,
    } satisfies UnitEntity,
    type: "appear",
  });
  expect(seen).toBe("appear");
});

test("triggerIgnoreEvent forwards to onIgnoreEvent callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onIgnoreEvent((event) => {
    seen = event.type;
  });
  handle.triggerIgnoreEvent({ entries: [], type: "ignore-list" });
  expect(seen).toBe("ignore-list");
});

test("triggerGuildEvent forwards to onGuildEvent callback", () => {
  const handle = createMockHandle();
  let seen = "";
  handle.onGuildEvent((event) => {
    seen = event.type;
  });
  handle.triggerGuildEvent({
    roster: {
      guildInfo: "",
      guildName: "",
      members: [],
      motd: "",
      rankNames: [],
    },
    type: "guild-roster",
  });
  expect(seen).toBe("guild-roster");
});

test("notice and trainer triggers reach their hooks", () => {
  const handle = createMockHandle();
  const seen: string[] = [];
  handle.onNotice((event) => seen.push(event.label));
  handle.onTrainerEvent((event) => seen.push(event.type));
  handle.triggerNotice({
    at: 1,
    label: "Weather change",
    opcode: 1,
    text: "[peon] Weather change is not yet implemented",
    type: "not_implemented",
  });
  handle.triggerTrainerEvent({
    at: 1,
    state: {
      coinage: undefined,
      lastOutcome: undefined,
      level: undefined,
      offer: undefined,
      pending: undefined,
    },
    type: "listed",
  });
  expect(seen).toEqual(["Weather change", "listed"]);
});

test("mock queryNearby marks attackers from the combat state", () => {
  const handle = createMockHandle();
  const npc = {
    class_: 0,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid: 7n,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [],
    name: "Wolf",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  } satisfies UnitEntity;
  const base = handle.getCombatState();
  handle.getNearbyEntities = () => [npc];
  handle.getCombatState = () => ({ ...base, attackers: [7n] });
  expect(handle.queryNearby()[0]).toMatchObject({
    attackingMe: true,
    relation: "unknown",
  });
});

test("triggerAreaEvent reaches onAreaEvent until it unsubscribes", () => {
  const handle = createMockHandle();
  const seen: AreaEvent[] = [];
  const off = handle.onAreaEvent((event) => seen.push(event));
  const trigger = handle.triggerAreaEvent as (
    area: string,
    event: { type: string },
  ) => void;
  trigger("alpha", { type: "ticked" });
  off();
  trigger("alpha", { type: "ticked" });
  expect(seen).toEqual([
    { area: "alpha", event: { type: "ticked" } } as unknown as AreaEvent,
  ]);
});

test("handle.time exposes state, onEvent and query", async () => {
  jest.useFakeTimers();
  const handle = createMockHandle();
  try {
    expect(handle.time.state().dailyResetInSec).toBeUndefined();
    const pending = handle.time.act.query();
    const settled = pending.then(
      () => "resolved",
      (error: Error) => error.message,
    );
    expect(handle.sent).toEqual([
      { body: new Uint8Array(), opcode: GameOpcode.CMSG_QUERY_TIME },
    ]);
    jest.advanceTimersByTime(TIME_QUERY_TIMEOUT_MS);
    expect(await settled).toBe("timeout");
  } finally {
    handle.close();
    jest.useRealTimers();
  }
});

test("triggerAreaEvent for time reaches onAreaEvent and handle.time.onEvent", () => {
  const handle = createMockHandle();
  const areaSeen: AreaEvent[] = [];
  const timeSeen: string[] = [];
  handle.onAreaEvent((event) => areaSeen.push(event));
  handle.time.onEvent((event) => timeSeen.push(event.type));
  const reply = {
    state: handle.time.state(),
    type: "query_reply",
  } as const;
  handle.triggerAreaEvent("time", reply);
  expect(areaSeen).toEqual([{ area: "time", event: reply }]);
  expect(timeSeen).toEqual(["query_reply"]);
});
