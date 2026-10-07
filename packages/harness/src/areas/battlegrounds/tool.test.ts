import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { NearbyRow } from "@peon/core";

import {
  pvpParams,
  pvpSpec,
  pvpTool,
  runPvp,
} from "#harness/areas/battlegrounds/tool";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function callOf() {
  return {
    arguments: pvpSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

async function rig(
  over: {
    acts?: Record<string, unknown>;
    battlegrounds?: Record<string, unknown>;
    units?: readonly NearbyRow[];
  } = {},
) {
  const t = await createTestRuntime({});
  setUnits(
    t.handle,
    over.units ?? [
      unitRow({
        distance: 5,
        guid: 0xaaaan,
        level: 10,
        name: "Mate",
        player: true,
        relation: "friendly",
        x: 1,
        y: 1,
      }),
    ],
  );
  Object.assign(t.handle.battlegrounds.act, {
    answer: jest.fn(async (slot: number) => ({ kind: "active", slot })),
    join: jest.fn(async (bgType: number) => ({
      slot: 0,
      status: { avgWaitMs: 180_000, bgType, kind: "queued" },
    })),
    leaveBattleground: jest.fn(async () => ({ kind: "left" as const })),
    leaveQueue: jest.fn(async (slot: number) => ({ kind: "none", slot })),
    list: jest.fn(async (bgType: number) => ({
      bgType,
      fromWhere: 1,
      guid: 0n,
      instances: [3],
      random: undefined,
      rewards: { hasWin: true, lossHonor: 30, winArena: 0, winHonor: 90 },
    })),
    reportAfk: jest.fn(async () => ({ kind: "reported" as const })),
    requestCarriers: jest.fn(async () => ({ carriers: [] })),
    requestScore: jest.fn(async () => ({
      arena: false,
      ended: false,
      players: [],
      teams: [],
      winner: undefined,
    })),
    setPvp: jest.fn(async (on: boolean) => ({ kind: "set", on })),
    ...(over.acts ?? {}),
  });
  jest.spyOn(t.handle.battlegrounds, "state").mockReturnValue({
    match: { current: undefined, spirit: undefined },
    queue: { lastJoin: undefined, list: undefined, slots: [{ kind: "none" }] },
    ...(over.battlegrounds ?? {}),
  } as never);
  return t;
}

describe("pvp tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: pvpParams },
        callOf(),
      ),
    ).toEqual(pvpSpec.minimalArgs);
  });

  test("list is kind action", () => {
    expect(pvpTool.kind).toBe("action");
  });
});

describe("pvp list and queue", () => {
  test("list reads the Warsong rewards", async () => {
    const t = await rig();
    const out = await runPvp({ bg: "warsong", do: "list" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.list).toHaveBeenCalledWith(2);
    expect(out.detail).toContain("Warsong");
  });

  test("queue joins Warsong Gulch in slot 0", async () => {
    const t = await rig();
    const out = await runPvp({ do: "queue" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("slot 0");
  });

  test("queue leave leaves the slot", async () => {
    const t = await rig();
    const out = await runPvp(
      { action: "leave", do: "queue", slot: 1 },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.leaveQueue).toHaveBeenCalledWith(1);
  });
});

describe("pvp accept, decline and leave", () => {
  test("accept with no invitation refuses no_invitation", async () => {
    const t = await rig();
    await expect(runPvp({ do: "accept" }, toolCtx(t))).rejects.toMatchObject({
      reason: "no_invitation",
    });
  });

  test("accept enters on an invited slot", async () => {
    const t = await rig({
      battlegrounds: {
        match: { current: undefined, spirit: undefined },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [
            {
              arenaType: 0,
              avgWaitMs: 0,
              bgType: 2,
              expiresAt: 99,
              inQueueMs: 0,
              instanceId: 1,
              isArena: 0,
              kind: "invited",
              mapId: 489,
              maxLevel: 19,
              minLevel: 10,
              rated: false,
              receivedAt: 0,
              slot: 0,
              timeToRemoveMs: 60_000,
              word: 0x1f_90,
            },
          ],
        },
      },
    });
    const out = await runPvp({ do: "accept" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("entered");
  });

  test("leave inside a match leaves the battleground", async () => {
    const t = await rig({
      battlegrounds: {
        match: {
          current: {
            bgType: 2,
            carriers: [],
            enteredAt: 0,
            mapId: 489,
            rez: undefined,
            roster: [],
            score: undefined,
          },
          spirit: undefined,
        },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [{ kind: "none" }],
        },
      },
    });
    const out = await runPvp({ do: "leave" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.leaveBattleground).toHaveBeenCalled();
  });

  test("leave with an empty slot refuses", async () => {
    const t = await rig();
    const out = await runPvp({ do: "leave", slot: 0 }, toolCtx(t));
    expect(out).toMatchObject({ reason: "no_slot", status: "REFUSED" });
  });
});

describe("pvp score, flag and report", () => {
  test("score reads the board and the carriers", async () => {
    const t = await rig();
    const out = await runPvp({ do: "score" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.requestScore).toHaveBeenCalled();
    expect(t.handle.battlegrounds.act.requestCarriers).toHaveBeenCalled();
  });

  test("flag sets the PvP flag on", async () => {
    const t = await rig();
    const out = await runPvp({ do: "flag", on: true }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.setPvp).toHaveBeenCalledWith(true);
  });

  test("report on a unit outside the battleground refuses", async () => {
    const t = await rig();
    await expect(
      runPvp({ do: "report", unit: "Mate" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "not_in_battleground" });
  });

  test("report sends for a teammate in the roster", async () => {
    const t = await rig({
      battlegrounds: {
        match: {
          current: {
            bgType: 2,
            carriers: [],
            enteredAt: 0,
            mapId: 489,
            rez: undefined,
            roster: [0xaaaan],
            score: undefined,
          },
          spirit: undefined,
        },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [{ kind: "none" }],
        },
      },
    });
    const out = await runPvp({ do: "report", unit: "Mate" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.reportAfk).toHaveBeenCalledWith(0xaaaan);
  });

  test("report sends for a visible teammate the roster never listed", async () => {
    const t = await rig({
      battlegrounds: {
        match: {
          current: {
            bgType: 2,
            carriers: [],
            enteredAt: 0,
            mapId: 489,
            rez: undefined,
            roster: [],
            score: undefined,
          },
          spirit: undefined,
        },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [{ kind: "none" }],
        },
      },
    });
    const out = await runPvp({ do: "report", unit: "Mate" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.reportAfk).toHaveBeenCalledWith(0xaaaan);
  });

  test("report sends for a score-listed teammate outside the roster", async () => {
    const t = await rig({
      battlegrounds: {
        match: {
          current: {
            bgType: 2,
            carriers: [],
            enteredAt: 0,
            mapId: 489,
            rez: undefined,
            roster: [],
            score: {
              arena: false,
              ended: false,
              players: [
                {
                  arenaTeam: undefined,
                  bonusHonor: 0,
                  damage: 0,
                  deaths: 0,
                  guid: 0xaaaan,
                  healing: 0,
                  honorableKills: 0,
                  killingBlows: 0,
                  objectives: [],
                },
              ],
              teams: [],
              winner: undefined,
            },
          },
          spirit: undefined,
        },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [{ kind: "none" }],
        },
      },
    });
    const out = await runPvp({ do: "report", unit: "Mate" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.battlegrounds.act.reportAfk).toHaveBeenCalledWith(0xaaaan);
  });

  test("report on a hostile unit in the match refuses", async () => {
    const t = await rig({
      battlegrounds: {
        match: {
          current: {
            bgType: 2,
            carriers: [],
            enteredAt: 0,
            mapId: 489,
            rez: undefined,
            roster: [],
            score: undefined,
          },
          spirit: undefined,
        },
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [{ kind: "none" }],
        },
      },
      units: [
        unitRow({
          distance: 5,
          guid: 0xaaaan,
          level: 10,
          name: "Foe",
          player: true,
          relation: "hostile",
          x: 1,
          y: 1,
        }),
      ],
    });
    await expect(
      runPvp({ do: "report", unit: "Foe" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "not_in_battleground" });
    expect(t.handle.battlegrounds.act.reportAfk).not.toHaveBeenCalled();
  });
});
