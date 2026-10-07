import { describe, expect, test } from "bun:test";
import {
  BG_ME,
  battlegroundsJoinedLeftBody,
  battlegroundsPositionsBody,
  battlegroundsPvpLogBody,
  battlegroundsSpiritTimeBody,
} from "#test-support/areas/battlegrounds";
import {
  buildAreaSpiritHealerQuery,
  buildAreaSpiritHealerQueue,
  buildEmptyRequest,
  buildLeaveBattlefield,
  buildReportPvpAfk,
  parseAreaSpiritHealerTime,
  parseBattlegroundPlayerGuid,
  parsePlayerPositions,
  parsePvpLogData,
} from "#wow/areas/battlegrounds/protocol-match";
import { PacketReader } from "#wow/protocol/packet";

function read(body: Uint8Array): PacketReader {
  return new PacketReader(body);
}

describe("battlegrounds match packets (Battlegrounds/Battleground.cpp:1373-1401)", () => {
  test("joined and left bodies hold one guid (Battlegrounds/BattlegroundMgr.cpp:256-266)", () => {
    expect(
      parseBattlegroundPlayerGuid(read(battlegroundsJoinedLeftBody(BG_ME))),
    ).toBe(BG_ME);
  });

  test("parsePvpLogData reads a Warsong board with two objectives (Battlegrounds/Zones/BattlegroundWS.cpp:29-34)", () => {
    const parsed = parsePvpLogData(
      read(
        battlegroundsPvpLogBody({
          players: [
            {
              bonusHonor: 62,
              damage: 1200,
              deaths: 1,
              guid: BG_ME,
              healing: 40,
              honorableKills: 3,
              killingBlows: 1,
              objectives: [2, 0],
            },
          ],
        }),
      ),
    );
    expect(parsed.arena).toBe(false);
    expect(parsed.ended).toBe(false);
    expect(parsed.winner).toBeUndefined();
    expect(parsed.players).toEqual([
      {
        arenaTeam: undefined,
        bonusHonor: 62,
        damage: 1200,
        deaths: 1,
        guid: BG_ME,
        healing: 40,
        honorableKills: 3,
        killingBlows: 1,
        objectives: [2, 0],
      },
    ]);
  });

  test("parsePvpLogData reads an ended board with a winner (Battlegrounds/Battleground.cpp:1387-1392)", () => {
    const parsed = parsePvpLogData(
      read(battlegroundsPvpLogBody({ ended: true, players: [], winner: 1 })),
    );
    expect(parsed.ended).toBe(true);
    expect(parsed.winner).toBe(1);
    expect(parsed.players).toEqual([]);
  });

  test("parsePvpLogData reads the arena form (Battlegrounds/Arena.cpp:32-63)", () => {
    const parsed = parsePvpLogData(
      read(
        battlegroundsPvpLogBody({
          arena: true,
          players: [
            {
              arenaTeam: 1,
              damage: 900,
              guid: BG_ME,
              healing: 0,
              killingBlows: 2,
              objectives: [],
            },
          ],
          teams: [
            { mmr: 1500, name: "Gold", ratingLost: 0, ratingWon: 12 },
            { mmr: 1490, name: "Green", ratingLost: 12, ratingWon: 0 },
          ],
        }),
      ),
    );
    expect(parsed.arena).toBe(true);
    expect(parsed.teams.map((team) => team.name)).toEqual(["Gold", "Green"]);
    expect(parsed.players).toEqual([
      {
        arenaTeam: 1,
        bonusHonor: undefined,
        damage: 900,
        deaths: undefined,
        guid: BG_ME,
        healing: 0,
        honorableKills: undefined,
        killingBlows: 2,
        objectives: [],
      },
    ]);
  });

  test("parsePvpLogData caps the player count at 80", () => {
    const players = Array.from({ length: 81 }, (_, index) => ({
      guid: BigInt(index + 1),
    }));
    expect(() =>
      parsePvpLogData(read(battlegroundsPvpLogBody({ players }))),
    ).toThrow("pvp log lists 81 players");
  });
  test("parsePlayerPositions reads empty and two carriers (Handlers/BattleGroundHandler.cpp:298-347)", () => {
    expect(parsePlayerPositions(read(battlegroundsPositionsBody()))).toEqual({
      carriers: [],
    });
    const parsed = parsePlayerPositions(
      read(
        battlegroundsPositionsBody([
          { guid: 1n, x: 10, y: 20 },
          { guid: 2n, x: 30, y: 40 },
        ]),
      ),
    );
    expect(parsed.carriers.map((carrier) => carrier.guid)).toEqual([1n, 2n]);
    expect(parsed.carriers[0]?.x).toBeCloseTo(10);
  });

  test("parseAreaSpiritHealerTime reads guid and wait (Battlegrounds/BattlegroundMgr.cpp:665-673)", () => {
    expect(
      parseAreaSpiritHealerTime(
        read(battlegroundsSpiritTimeBody({ guid: BG_ME, ms: 29_500 })),
      ),
    ).toEqual({ guid: BG_ME, ms: 29_500 });
  });

  test("client requests are empty or one guid (Handlers/BattleGroundHandler.cpp:619-635,928-943)", () => {
    expect([...buildEmptyRequest()]).toEqual([]);
    expect([...buildLeaveBattlefield()]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...buildReportPvpAfk(BG_ME)]).toEqual([0, 11, 0, 0, 0, 0, 0, 0]);
    expect([...buildAreaSpiritHealerQuery(BG_ME)]).toEqual([
      0, 11, 0, 0, 0, 0, 0, 0,
    ]);
    expect([...buildAreaSpiritHealerQueue(BG_ME)]).toEqual([
      0, 11, 0, 0, 0, 0, 0, 0,
    ]);
  });
});
