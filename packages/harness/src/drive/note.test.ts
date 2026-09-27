import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { nextHostile } from "#harness/drive/actions";
import {
  type HandBack,
  handBackNote,
  NOTE_LINES_CAP,
} from "#harness/drive/note";

const pose = (x: number, source: "server" | "predicted") => ({
  mapId: 530,
  orientation: 0,
  source,
  updatedAt: 0,
  x,
  y: 0,
  z: 0,
});

const BACK: HandBack = {
  actions: ["cast Smite", "cast Smite", "opened loot on Springpaw Stalker"],
  durationMs: 41_600,
  from: pose(0, "server"),
  lines: [
    "Cast Smite succeeded.",
    "Cast Smite succeeded.",
    "Kill credit: Springpaw Stalker u3 (+80 XP).",
  ],
  self: {
    health: 180,
    maxHealth: 217,
    maxPower: 607,
    power: 500,
    powerType: 0,
    target: undefined,
  },
  stopped: ["r2 rest cancelled: FAILED the human stopped you."],
  targets: ["Springpaw Stalker"],
  to: pose(14.4, "server"),
};

describe("handBackNote", () => {
  test("reports the drive from observed facts", () => {
    expect(handBackNote(BACK)).toBe(
      [
        "[human] The human drove the character for 42 s and handed control back.",
        "Taking over stopped: r2 rest cancelled: FAILED the human stopped you.",
        "Moved 14 yd, from 0, 0 to 14, 0 (the end pose is from the server).",
        "Targets picked: Springpaw Stalker.",
        "Human actions: cast Smite (x2); opened loot on Springpaw Stalker.",
        "Game log while driving:",
        "Cast Smite succeeded. (x2)",
        "Kill credit: Springpaw Stalker u3 (+80 XP).",
        "Now: HP 180/217, mana 500/607, no target.",
      ].join("\n"),
    );
  });

  test("labels a predicted pose, an unobserved pose and a long log", () => {
    const lines = Array.from({ length: NOTE_LINES_CAP + 3 }, (_, i) => `l${i}`);
    const note = handBackNote({ ...BACK, lines, to: pose(3, "predicted") });
    expect(note).toContain("(the end pose is the client's prediction)");
    expect(note).toContain("(3 earlier lines not shown)");
    expect(note).not.toContain("\nl2\n");
    expect(handBackNote({ ...BACK, from: undefined })).toContain(
      "Movement: no pose was observed.",
    );
  });

  test("tells no target from a selected target whose name was not observed", () => {
    const self = BACK.self ?? ({} as never);
    expect(
      handBackNote({ ...BACK, self: { ...self, target: { name: undefined } } }),
    ).toContain("target selected, name not observed.");
    expect(
      handBackNote({ ...BACK, self: { ...self, target: { name: "Kel" } } }),
    ).toContain("target Kel.");
    expect(handBackNote(BACK)).toContain("no target.");
  });

  test("says why control returned when the drive did not end with Esc", () => {
    expect(handBackNote(BACK, "the game connection closed")).toStartWith(
      "[human] The human drove the character for 42 s; control returned to the agent because the game connection closed.",
    );
  });
});

describe("nextHostile", () => {
  const row = (guid: bigint, distance: number, extra = {}) =>
    ({
      attackable: true,
      distance,
      entity: { guid, health: 10, name: `u${guid}` },
      relation: "hostile",
      self: false,
      ...extra,
    }) as unknown as NearbyRow;

  test("cycles living hostiles from the nearest out", () => {
    const rows = [
      row(1n, 30),
      row(2n, 10),
      row(3n, 5, { entity: { guid: 3n, health: 0 } }),
      row(4n, 8, { relation: "friendly" }),
      row(5n, 20),
    ];
    const order = [undefined, 2n, 5n, 1n].map(
      (current) => nextHostile(rows, current)?.entity.guid,
    );
    expect(order).toEqual([2n, 5n, 1n, 2n]);
    expect(nextHostile([], undefined)).toBeUndefined();
  });
});
