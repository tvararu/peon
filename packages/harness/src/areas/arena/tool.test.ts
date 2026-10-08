import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState } from "@peon/core";

type ArenaTeam = AreaState<"arena">["teams"][string];

import { arenaParams, arenaSpec, runArena } from "#harness/areas/arena/tool";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const TEAM: ArenaTeam = {
  backgroundColor: 0,
  borderColor: 0,
  borderStyle: 0,
  emblemColor: 0,
  emblemStyle: 0,
  id: 7,
  members: [
    {
      captain: true,
      class: 1,
      guid: 0xaaaan,
      level: 80,
      name: "Boss",
      online: true,
      personalRating: 1500,
      seasonGames: 0,
      seasonWins: 0,
      weekGames: 10,
      weekWins: 6,
    },
  ],
  name: "Axes",
  rank: 1,
  rating: 1500,
  seasonGames: 0,
  seasonWins: 0,
  stale: false,
  type: 2,
  weekGames: 10,
  weekWins: 6,
};

function callOf() {
  return {
    arguments: arenaSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

async function rig(
  over: {
    acts?: Record<string, unknown>;
    state?: Record<string, unknown>;
  } = {},
) {
  const t = await createTestRuntime({});
  setUnits(t.handle, [
    unitRow({
      distance: 5,
      guid: 0xaaaan,
      level: 80,
      name: "Boss",
      player: true,
      relation: "friendly",
      x: 1,
      y: 1,
    }),
    unitRow({
      distance: 5,
      guid: 0xbbbbn,
      level: 80,
      name: "Rack",
      roles: ["battlemaster"],
      x: 2,
      y: 2,
    }),
  ]);
  Object.assign(t.handle.arena.act, {
    accept: jest.fn(async () => ({ team: "Axes" })),
    decline: jest.fn(async () => ({ status: "ok" as const })),
    disband: jest.fn(async () => ({ status: "ok" as const })),
    inspect: jest.fn(async () => ({ guid: 0xaaaan, rows: [] })),
    invite: jest.fn(async () => ({ status: "sent" as const })),
    joinQueue: jest.fn(async () => ({ status: "no_reply" as const })),
    leave: jest.fn(async () => ({ status: "ok" as const })),
    leaveQueue: jest.fn(async () => ({ status: "left" as const })),
    query: jest.fn(async () => ({ team: TEAM })),
    refresh: jest.fn(async () => [TEAM]),
    remove: jest.fn(async () => ({ status: "ok" as const })),
    roster: jest.fn(async () => ({ id: 7, members: TEAM.members })),
    setLeader: jest.fn(async () => ({ status: "ok" as const })),
    ...(over.acts ?? {}),
  });
  jest
    .spyOn(t.handle.arena, "state")
    .mockReturnValue({ teams: { 7: TEAM }, ...(over.state ?? {}) } as never);
  return t;
}

describe("arena tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: arenaParams },
        callOf(),
      ),
    ).toEqual(arenaSpec.minimalArgs);
  });
});

describe("arena show and team", () => {
  test("show lists teams with ratings", async () => {
    const t = await rig();
    const out = await runArena({ do: "show" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("1 arena team");
    expect(out.body.join("\n")).toContain("Axes");
  });

  test("show reports no teams", async () => {
    const t = await rig({
      acts: { refresh: jest.fn(async () => []) },
      state: { teams: {} },
    });
    const out = await runArena({ do: "show" }, toolCtx(t));
    expect(out.detail).toContain("no arena team");
  });

  test("team info resolves the 2v2 team", async () => {
    const t = await rig();
    const out = await runArena({ action: "info", do: "team" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.arena.act.query).toHaveBeenCalledWith(7);
    expect(out.body.join("\n")).toContain("1500");
  });

  test("team without a matching bracket refuses", async () => {
    const t = await rig({ state: { teams: {} } });
    await expect(
      runArena({ action: "roster", do: "team" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_team" });
  });

  test("invite without a name refuses", async () => {
    const t = await rig();
    await expect(
      runArena({ action: "invite", do: "team", team: 7 }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "missing_player" });
  });

  test("invite refusal surfaces the reason", async () => {
    const t = await rig({
      acts: {
        invite: jest.fn(async () => ({
          reason: "permissions",
          status: "refused" as const,
        })),
      },
    });
    const out = await runArena(
      { action: "invite", do: "team", name: "Ann", team: 7 },
      toolCtx(t),
    );
    expect(out).toMatchObject({ reason: "permissions", status: "REFUSED" });
  });

  test("accept joins the pending team", async () => {
    const t = await rig();
    const out = await runArena({ action: "accept", do: "team" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Axes");
  });

  test("leave runs inside the mutex", async () => {
    const t = await rig();
    const out = await runArena(
      { action: "leave", do: "team", team: 7 },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(t.handle.arena.act.leave).toHaveBeenCalledWith(7);
  });
});

describe("arena inspect and queue", () => {
  test("inspect reads a player in view", async () => {
    const t = await rig({
      acts: {
        inspect: jest.fn(async () => ({
          guid: 0xaaaan,
          rows: [{ rating: 1500, slot: 0, teamId: 7 }],
        })),
      },
    });
    const out = await runArena({ do: "inspect", unit: "Boss" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.body.join("\n")).toContain("1500");
  });

  test("inspect of an unseen unit refuses", async () => {
    const t = await rig();
    await expect(
      runArena({ do: "inspect", unit: "Ghost" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "not_seen" });
  });

  test("queue join uses the nearest battlemaster", async () => {
    const t = await rig({
      acts: {
        joinQueue: jest.fn(async () => ({
          queue: [],
          slot: 0,
          status: "queued" as const,
        })),
      },
    });
    const out = await runArena({ do: "queue", size: "2v2" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.arena.act.joinQueue).toHaveBeenCalledWith(
      0xbbbbn,
      0,
      false,
    );
  });

  test("queue join without a battlemaster refuses", async () => {
    const t = await rig();
    setUnits(t.handle, []);
    await expect(runArena({ do: "queue" }, toolCtx(t))).rejects.toMatchObject({
      reason: "no_battlemaster",
    });
  });

  test("queue leave with only a slot leaves", async () => {
    const t = await rig();
    const out = await runArena({ do: "queue", slot: 1 }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.arena.act.leaveQueue).toHaveBeenCalledWith(1);
  });

  test("queue leave reports the slot", async () => {
    const t = await rig();
    const out = await runArena(
      { action: "leave", do: "queue", slot: 1 },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(t.handle.arena.act.leaveQueue).toHaveBeenCalledWith(1);
  });
});
