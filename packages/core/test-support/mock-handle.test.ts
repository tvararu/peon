import { expect, test } from "bun:test";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
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

test("default who returns empty list", async () => {
  const handle = createMockHandle();
  await expect(handle.who({})).resolves.toEqual([]);
});

test("getLastChatMode defaults to say", () => {
  const handle = createMockHandle();
  expect(handle.getLastChatMode()).toEqual({ type: "say" });
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

test("default getNearbyEntities returns empty list", () => {
  const handle = createMockHandle();
  expect(handle.getNearbyEntities()).toEqual([]);
});

test("default getFriends returns empty list", () => {
  const handle = createMockHandle();
  expect(handle.getFriends()).toEqual([]);
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

test("default getIgnored returns empty list", () => {
  const handle = createMockHandle();
  expect(handle.getIgnored()).toEqual([]);
});

test("default requestGuildRoster returns undefined", async () => {
  const handle = createMockHandle();
  await expect(handle.requestGuildRoster()).resolves.toBeUndefined();
});

test("new surface stubs return neutral values", () => {
  const handle = createMockHandle();
  expect(handle.capabilities()).toEqual({
    factions: false,
    spells: false,
  });
  expect(handle.getPlaceState()).toEqual({
    area: undefined,
    areaId: undefined,
    at: undefined,
    mapId: undefined,
    zone: undefined,
    zoneId: undefined,
  });
  expect(handle.getCreatureInfo(1)).toBeUndefined();
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
