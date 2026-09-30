import { describe, expect, jest, test } from "bun:test";
import type { SpellDefinition } from "@peon/core";
import { spell } from "@peon/core/test-support/spell-fixtures";
import {
  eversong,
  type LookWorld,
  NOW,
  place,
  stalker,
  world,
} from "#test-support/look-fixtures";
import { runTool } from "#test-support/tool-harness";

const STALKER = 0x25n;
const OTHER = 0x99n;

type Setup = {
  channel?: { spellId: number; endsAt?: number; durationMs?: number };
  casts?: {
    at?: number;
    durationMs: number;
    guid: bigint;
    kind?: "cast" | "channel";
    spellId: number;
  }[];
  selected?: bigint;
};

const NAMES: Record<number, string> = {
  133: "Fireball",
  5143: "Arcane Missiles",
};

async function lookWorld(init: Setup): Promise<LookWorld> {
  const w = await world();
  place(w.handle, eversong([stalker()]), {
    selectedGuid: init.selected ?? STALKER,
  });
  const real = w.handle.spells.state();
  jest.spyOn(w.handle.spells, "state").mockReturnValue({
    ...real,
    channel: init.channel && {
      cancelRequested: false,
      durationMs: init.channel.durationMs,
      endsAt: init.channel.endsAt,
      remainingMs: undefined,
      spellId: init.channel.spellId,
      startedAt: NOW - 2000,
      target: undefined,
    },
    unitCasts: (init.casts ?? []).map((cast) => ({
      durationMs: cast.durationMs,
      guid: cast.guid,
      kind: cast.kind ?? "cast",
      relevant: true,
      spellId: cast.spellId,
      startedAt: cast.at ?? NOW - 300,
      target: undefined,
    })),
  });
  jest
    .spyOn(w.handle, "spellDefinition")
    .mockImplementation((id) =>
      NAMES[id] === undefined
        ? undefined
        : ({ ...spell(), name: NAMES[id] } as SpellDefinition),
    );
  return w;
}

describe("look casts", () => {
  test("the self line says the running channel and its time left", async () => {
    const w = await lookWorld({
      channel: { endsAt: NOW + 3000, spellId: 5143 },
    });
    const { text } = await runTool(w.tool, {});
    expect(text.split("\n")[0]).toContain(
      "channelling Arcane Missiles, 3 s left",
    );
  });

  test("a channel without an end time counts from its duration", async () => {
    const w = await lookWorld({
      channel: { durationMs: 5000, spellId: 5143 },
    });
    const { text } = await runTool(w.tool, {});
    expect(text.split("\n")[0]).toContain(
      "channelling Arcane Missiles, 3 s left",
    );
  });

  test("the target line says the target's cast", async () => {
    const w = await lookWorld({
      casts: [{ durationMs: 1500, guid: STALKER, spellId: 133 }],
    });
    const { details, text } = await runTool(w.tool, {});
    const target = text.split("\n").find((row) => row.startsWith("Target:"));
    expect(target).toContain("casting Fireball, 1.2 s left");
    expect(details.tool === "look" && details.result.after.targetCast).toEqual({
      kind: "cast",
      remainingMs: 1200,
      spellId: 133,
      spellName: "Fireball",
    });
  });

  test("the target line says channelling for a channel", async () => {
    const w = await lookWorld({
      casts: [
        { durationMs: 3000, guid: STALKER, kind: "channel", spellId: 5143 },
      ],
    });
    const { details, text } = await runTool(w.tool, {});
    const target = text.split("\n").find((row) => row.startsWith("Target:"));
    expect(target).toContain("channelling Arcane Missiles, 2.7 s left");
    expect(details.tool === "look" && details.result.after.targetCast).toEqual({
      kind: "channel",
      remainingMs: 2700,
      spellId: 5143,
      spellName: "Arcane Missiles",
    });
  });

  test("another unit's cast is not the target's", async () => {
    const w = await lookWorld({
      casts: [{ durationMs: 1500, guid: OTHER, spellId: 133 }],
    });
    const { details, text } = await runTool(w.tool, {});
    expect(text).not.toContain("casting Fireball");
    expect(details.tool === "look" && details.result.after.targetCast).toBe(
      undefined,
    );
  });

  test("an overdue cast is not shown", async () => {
    const w = await lookWorld({
      casts: [
        { at: NOW - 5000, durationMs: 1500, guid: STALKER, spellId: 133 },
      ],
    });
    expect((await runTool(w.tool, {})).text).not.toContain("casting Fireball");
  });

  test("an unknown spell falls back to its id", async () => {
    const w = await lookWorld({
      casts: [{ durationMs: 2000, guid: STALKER, spellId: 777 }],
    });
    expect((await runTool(w.tool, {})).text).toContain("casting spell 777");
  });

  test("no cast and no channel leaves both lines plain", async () => {
    const w = await lookWorld({});
    const { text } = await runTool(w.tool, {});
    expect(text).not.toContain("channelling");
    expect(text).not.toContain("casting");
  });
});
