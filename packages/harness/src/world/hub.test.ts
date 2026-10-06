import { describe, expect, mock, test } from "bun:test";
import type { Entity, EntityEvent, UnitEntity } from "@peon/core";
import { createWorldService } from "#harness/world/hub";
import type { WorldSession } from "#harness/world/service";
import { createMockGame, type MockGame } from "#test-support/mock-game";
import { createTestRuntime } from "#test-support/runtime-fixture";

const EVENT: EntityEvent = { guid: 0n, type: "disappear" };

const CLOCK = { clock: { area: "clock", worldActs: ["sync"] } } as const;
type ClockActs = { clock: { sync: () => Promise<unknown> } };

function withClock(game: MockGame) {
  const sync = mock(async () => "synced");
  return Object.assign(game, {
    clock: {
      act: { sync },
      onEvent: () => () => undefined,
      state: () => ({ speed: 0.01 }),
    },
  }).clock.act.sync;
}

async function setup() {
  const first = createMockGame();
  const second = createMockGame();
  const games: MockGame[] = [first, second];
  let logins = 0;
  const { rt } = await createTestRuntime({
    connect: false,
    parts: {
      login: async () => {
        const game = games[logins] ?? createMockGame();
        logins += 1;
        return game;
      },
    },
  });
  return {
    first,
    rt,
    second,
    world: createWorldService(rt, CLOCK).service,
  };
}

describe("createWorldService sessions", () => {
  test("attaches on connect, cleans up on close and re-attaches after a reconnect", async () => {
    const { first, rt, second, world } = await setup();
    const seen: WorldSession[] = [];
    const cleaned: WorldSession[] = [];
    const events: EntityEvent[] = [];
    world.onSession((session) => {
      seen.push(session);
      session.events.onEntityEvent((event) => events.push(event));
      return () => cleaned.push(session);
    });
    expect(world.current()).toBeUndefined();
    await rt.connect();
    first.triggerEntityEvent(EVENT);
    await rt.disconnect();
    first.triggerEntityEvent(EVENT);
    expect(world.current()).toBeUndefined();
    await rt.connect();
    second.triggerEntityEvent(EVENT);
    expect(seen).toHaveLength(2);
    expect(cleaned).toEqual([seen[0] as WorldSession]);
    expect(events).toHaveLength(2);
    expect(world.current()).toBe(seen[1] as WorldSession);
  });

  test("a session reads live state but reaches no writer or lifecycle call", async () => {
    const { first, rt, world } = await setup();
    await rt.connect();
    const session = world.current() as WorldSession;
    expect(session.reads.getControlState()).toEqual(first.getControlState());
    for (const name of ["close", "logout", "halt", "move", "sendSay"])
      expect(
        [session, session.reads, session.events].some((part) => name in part),
      ).toBe(false);
    expect(Object.isFrozen(session.reads)).toBe(true);
    expect(Object.isFrozen(world)).toBe(true);
  });
});

describe("createWorldService claims", () => {
  test("a held claim sends; a human claim makes every later send refuse", async () => {
    const { first, rt, world } = await setup();
    await rt.connect();
    const claim = world.claim("loop", "probe");
    const lost: string[] = [];
    claim?.onLost((to) => lost.push(to));
    await claim?.act.move("forward", 2000);
    expect(first.move).toHaveBeenCalledWith("forward", 2000);
    const human = rt.control.claim("human", "key");
    await expect(claim?.act.move("forward", 2000)).rejects.toThrow("not_owner");
    if (human.granted) rt.control.release(human.grant, "key");
    await expect(claim?.act.face(1)).rejects.toThrow("not_owner");
    expect(first.move).toHaveBeenCalledTimes(1);
    expect(first.face).not.toHaveBeenCalled();
    expect(claim?.held()).toBe(false);
    expect(lost).toEqual(["human"]);
  });

  test("a claim below the holder is refused and a free body is granted", async () => {
    const { rt, world } = await setup();
    const human = rt.control.claim("human", "key");
    expect(world.claim("loop", "probe")).toBeUndefined();
    expect(world.claim("agent", "probe")).toBeUndefined();
    if (human.granted) rt.control.release(human.grant, "key");
    expect(world.claim("loop", "probe")?.held()).toBe(true);
    expect(world.control.owner()).toBe("loop");
  });

  test("a held claim refuses while offline and release frees the body", async () => {
    const { rt, world } = await setup();
    const claim = world.claim("loop", "probe");
    await expect(claim?.act.stopMoving()).rejects.toThrow("offline");
    claim?.release();
    expect(rt.control.owner()).toBe("none");
    expect(claim?.held()).toBe(false);
  });

  test("a claim refuses while the connection is closing", async () => {
    const { first, rt } = await setup();
    await rt.connect();
    const world = createWorldService({ ...rt, connection: () => "closing" });
    const claim = world.service.claim("loop", "probe");
    await expect(claim?.act.stopMoving()).rejects.toThrow("offline");
    expect(first.stopMoving).not.toHaveBeenCalled();
  });

  test("a second claim by the same owner makes the first one refuse", async () => {
    const { first, rt, world } = await setup();
    await rt.connect();
    const older = world.claim("loop", "probe");
    const lost: string[] = [];
    older?.onLost((to) => lost.push(to));
    const newer = world.claim("loop", "script");
    await expect(older?.act.jump()).rejects.toThrow("not_owner");
    await newer?.act.jump();
    expect(first.jump).toHaveBeenCalledTimes(1);
    expect(lost).toEqual(["loop"]);
    older?.release();
    expect(newer?.held()).toBe(true);
  });

  test("dispose loses every live claim, frees the body and refuses new claims", async () => {
    const { first, rt } = await setup();
    await rt.connect();
    const hub = createWorldService(rt);
    const claim = hub.service.claim("loop", "probe");
    const lost: string[] = [];
    claim?.onLost((to) => lost.push(to));
    hub.dispose();
    expect(claim?.held()).toBe(false);
    expect(lost).toEqual(["none"]);
    expect(rt.control.owner()).toBe("none");
    await expect(claim?.act.move("forward", 500)).rejects.toThrow("not_owner");
    expect(first.move).not.toHaveBeenCalled();
    expect(hub.service.claim("loop", "probe")).toBeUndefined();
  });
});

describe("createWorldService snapshots", () => {
  test("reads, events and log entries are detached copies the caller cannot change", async () => {
    const { first, rt, world } = await setup();
    const live = {
      guid: 7n,
      health: 40,
      position: { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 },
      rawFields: new Map([[1, 2]]),
    } as unknown as Entity;
    Object.assign(first, { getNearbyEntities: () => [live] });
    await rt.connect();
    const session = world.current() as WorldSession;
    const read = session.reads.getNearbyEntities()[0] as UnitEntity;
    expect(read).toEqual(live as UnitEntity);
    expect(read).not.toBe(live as UnitEntity);
    expect(() => Object.assign(read, { health: 1 })).toThrow(TypeError);
    expect(() => (read.rawFields as Map<number, number>).set(1, 9)).toThrow(
      TypeError,
    );
    expect(session.reads.getNearbyEntities()).toEqual([live]);
    expect(Object.isFrozen(live)).toBe(false);
    const seen: EntityEvent[] = [];
    session.events.onEntityEvent((event) => seen.push(event));
    first.triggerEntityEvent({ entity: live, type: "appear" } as EntityEvent);
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect((seen[0] as { entity: Entity }).entity).not.toBe(live);
    const entry = rt.log.append({
      class: "log",
      data: { n: 1 },
      domain: "agent",
      event: "agent/message",
      text: "hi",
    });
    const [recent] = world.log.recent(1);
    expect(recent).toEqual(entry);
    expect(Object.isFrozen(recent?.data)).toBe(true);
  });
});

describe("createWorldService areas", () => {
  test("claim.areas sends a listed act and refuses not_owner once the claim is lost", async () => {
    const { first, rt, world } = await setup();
    const sync = withClock(first);
    await rt.connect();
    const claim = world.claim("loop", "probe");
    const areas = claim?.areas as unknown as ClockActs;
    expect(await areas.clock.sync()).toBe("synced");
    world.claim("agent", "probe");
    await expect(areas.clock.sync()).rejects.toThrow("not_owner");
    expect(sync).toHaveBeenCalledTimes(1);
  });

  test("claim.areas refuses offline with no session", async () => {
    const { first, world } = await setup();
    const sync = withClock(first);
    const claim = world.claim("loop", "probe");
    const areas = claim?.areas as unknown as ClockActs;
    await expect(areas.clock.sync()).rejects.toThrow("offline");
    expect(sync).not.toHaveBeenCalled();
  });

  test("session.areas reads frozen area state", async () => {
    const { first, rt, world } = await setup();
    withClock(first);
    await rt.connect();
    const session = world.current() as WorldSession;
    const areas = session.areas as unknown as {
      clock: { state: () => { speed: number } };
    };
    expect(areas.clock.state()).toEqual({ speed: 0.01 });
    expect(Object.isFrozen(areas.clock.state())).toBe(true);
  });
});
