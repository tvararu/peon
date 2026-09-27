import { describe, expect, test } from "bun:test";
import type { EntityEvent } from "@peon/core";
import { createWorldService } from "#harness/world/hub";
import type { WorldSession } from "#harness/world/service";
import { createMockGame, type MockGame } from "#test-support/mock-game";
import { createTestRuntime } from "#test-support/runtime-fixture";

const APPEAR = { type: "appear" } as EntityEvent;

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
  return { first, rt, second, world: createWorldService(rt).service };
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
    first.triggerEntityEvent(APPEAR);
    await rt.disconnect();
    first.triggerEntityEvent(APPEAR);
    expect(world.current()).toBeUndefined();
    await rt.connect();
    second.triggerEntityEvent(APPEAR);
    expect(seen).toHaveLength(2);
    expect(cleaned).toEqual([seen[0] as WorldSession]);
    expect(events).toHaveLength(2);
    expect(world.current()).toBe(seen[1] as WorldSession);
  });

  test("a session reads live state but reaches no writer or lifecycle call", async () => {
    const { first, rt, world } = await setup();
    await rt.connect();
    const session = world.current() as WorldSession;
    expect(session.reads.getControlState()).toBe(first.getControlState());
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
    rt.control.claim("human", "key");
    await expect(claim?.act.move("forward", 2000)).rejects.toThrow("not_owner");
    rt.control.release("human", "key");
    await expect(claim?.act.face(1)).rejects.toThrow("not_owner");
    expect(first.move).toHaveBeenCalledTimes(1);
    expect(first.face).not.toHaveBeenCalled();
    expect(claim?.held()).toBe(false);
    expect(lost).toEqual(["human"]);
  });

  test("a claim below the holder is refused and a free body is granted", async () => {
    const { rt, world } = await setup();
    rt.control.claim("human", "key");
    expect(world.claim("loop", "probe")).toBeUndefined();
    expect(world.claim("agent", "probe")).toBeUndefined();
    rt.control.release("human", "key");
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
});
