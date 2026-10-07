import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";

import { pvpLookLine } from "#harness/tools/look-pvp";

type Battlegrounds = AreaState<"battlegrounds">;
type Arena = AreaState<"arena">;

function bg(over: Partial<Battlegrounds> = {}): Battlegrounds {
  return {
    credits: [],
    inspect: new Map(),
    match: { current: undefined, spirit: undefined },
    queue: { lastJoin: undefined, list: undefined, slots: [{ kind: "none" }] },
    self: {
      arenaPoints: undefined,
      contested: false,
      ffa: false,
      flagged: false,
      honor: undefined,
      killsToday: undefined,
      killsYesterday: undefined,
      lifetimeKills: undefined,
      sanctuary: false,
      timer: false,
      today: undefined,
      wantsFlag: false,
      yesterday: undefined,
    },
    zoneAlerts: [],
    ...over,
  };
}

function arena(over: Partial<Arena> = {}): Arena {
  return { teams: {}, ...over } as Arena;
}

describe("pvp look line", () => {
  test("absent when every part is empty", () => {
    expect(pvpLookLine(bg(), arena())).toEqual([]);
  });

  test("shows the flag, honor and queues", () => {
    const lines = pvpLookLine(
      bg({
        queue: {
          lastJoin: undefined,
          list: undefined,
          slots: [
            {
              arenaType: 0,
              avgWaitMs: 60_000,
              bgType: 2,
              inQueueMs: 0,
              instanceId: 0,
              isArena: 0,
              kind: "queued",
              maxLevel: 19,
              minLevel: 10,
              rated: false,
              receivedAt: 0,
              word: 0x1f_90,
            },
          ],
        },
        self: {
          arenaPoints: 0,
          contested: false,
          ffa: false,
          flagged: true,
          honor: 120,
          killsToday: undefined,
          killsYesterday: undefined,
          lifetimeKills: undefined,
          sanctuary: false,
          timer: false,
          today: undefined,
          wantsFlag: true,
          yesterday: undefined,
        },
      }),
      arena(),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("PvP flag on");
    expect(lines[0]).toContain("120 honor");
    expect(lines[0]).toContain("Warsong Gulch");
  });

  test("shows the map, elapsed score inside a battleground", () => {
    const lines = pvpLookLine(
      bg({
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
              ended: true,
              players: [],
              teams: [],
              winner: 0,
            },
          },
          spirit: undefined,
        },
      }),
      arena(),
    );
    expect(lines[0]).toContain("map 489");
    expect(lines[0]).toContain("winner team 0");
  });
});
