import { expect, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { worldSession } from "@peon/core/session";
import { dbcFiles, packDbc } from "@peon/core/test-support/dbc";
import {
  clientPrivateKey,
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_CHARACTER,
  FIXTURE_PASSWORD,
  sessionKey,
} from "@peon/core/test-support/fixtures";
import { GameOpcode } from "@peon/core/test-support/internals";
import { startMockWorldServer } from "@peon/core/test-support/mock-world-server";
import { unitsPacket } from "@peon/core/test-support/unit-packets";
import type { JevActionResult, JevSelect } from "#harness/jev/contract";
import { createGame } from "#harness/loops/game";

const SELF = 0x42;
const TARGET = 0x99;

const emptyData = dbcFiles(
  new Map([
    ["Spell.dbc", packDbc(234, [])],
    ["SpellRange.dbc", packDbc(40, [])],
    ["SpellCastTimes.dbc", packDbc(4, [])],
    ["SpellDuration.dbc", packDbc(4, [])],
    ["SpellRadius.dbc", packDbc(4, [])],
    ["FactionTemplate.dbc", packDbc(14, [])],
  ]),
);

const hangUntilAborted: JevSelect = (_request, { signal }) =>
  new Promise<JevActionResult>((_resolve, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );

async function session() {
  const server = await startMockWorldServer({ loginMapId: 530 });
  const handle = await worldSession(
    {
      account: FIXTURE_ACCOUNT,
      character: FIXTURE_CHARACTER,
      clientSeed,
      dbc: emptyData,
      host: "127.0.0.1",
      password: FIXTURE_PASSWORD,
      port: server.port,
      srpPrivateKey: clientPrivateKey,
    },
    {
      realmHost: "127.0.0.1",
      realmId: 1,
      realmPort: server.port,
      sessionKey,
    },
  );
  const ready = Promise.withResolvers<void>();
  handle.onMessage((message) => {
    if (message.message === "game-ready") ready.resolve();
  });
  server.inject(GameOpcode.SMSG_UPDATE_OBJECT, unitsPacket(SELF, TARGET, 3));
  handle.sendSay("game-ready");
  await ready.promise;
  return { handle, server };
}

function recordActuators(handle: WorldHandle, calls: string[]): WorldHandle {
  return {
    ...handle,
    logout() {
      calls.push("logout");
      handle.logout();
    },
    stopCombat() {
      calls.push("stopCombat");
      handle.stopCombat();
    },
    stopMoving(reason) {
      calls.push("stopMoving");
      handle.stopMoving(reason);
    },
  };
}

test("a raw move leaves the cycle running until takeControl stops it", async () => {
  const { handle, server } = await session();
  try {
    const game = createGame(handle);
    const running = game.startCycle([BigInt(TARGET)], "stay alive", 1);
    expect(game.getCycleState().active).toBe(true);
    game.move("forward", 1000);
    expect(game.getCycleState().active).toBe(true);
    game.takeControl("manual_override");
    expect(game.getCycleState()).toMatchObject({
      active: false,
      stopCause: "manual_override",
    });
    game.move("forward", 1000);
    expect(game.getControlState().moving).toBe(true);
    await running;
  } finally {
    handle.close();
    await handle.closed;
    server.stop();
  }
});

async function activeTactics(handle: WorldHandle, calls: string[]) {
  const game = createGame(recordActuators(handle, calls), {
    jev: { select: hangUntilAborted },
  });
  const requested = Promise.withResolvers<void>();
  game.onTacticsEvent((event) => {
    if (event.type === "request") requested.resolve();
  });
  const running = game.startTactics(BigInt(TARGET), "Hold this target");
  await requested.promise;
  calls.length = 0;
  return { game, running };
}

test("a closed session retires an active tactics run without acting through the handle", async () => {
  const { handle, server } = await session();
  const calls: string[] = [];
  const { game, running } = await activeTactics(handle, calls);
  server.stop();
  await handle.closed;
  await running;
  expect(game.getTacticsState().status).toBe("idle");
  expect(calls).toEqual([]);
});

test("logout retires an active tactics run before the core session disposes", async () => {
  const { handle, server } = await session();
  const calls: string[] = [];
  try {
    const { game, running } = await activeTactics(handle, calls);
    game.logout();
    expect(game.getTacticsState()).toMatchObject({
      lastStopReason: "disposed",
      status: "idle",
    });
    await running;
    handle.close();
    await handle.closed;
    expect(calls).toEqual(["logout"]);
  } finally {
    server.stop();
  }
});
