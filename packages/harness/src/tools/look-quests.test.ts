import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { lookTool } from "#harness/tools/look";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind, runTool } from "#test-support/tool-harness";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

const NOW = 1_000_000;

type QuestsState = AreaState<"quests">;

const ERONA = 0x22n;
const JULIA = 0x23n;
const GUARD = 0x24n;
const LYNX = 0x25n;

function stateWith(entries: [bigint, number][]): QuestsState {
  return {
    completed: undefined,
    gossipPoi: undefined,
    marks: new Map(
      entries.map(([guid, status]) => [
        guid,
        { at: NOW, source: "multiple" as const, status },
      ]),
    ),
    pois: new Map(),
    texts: new Map(),
  };
}

async function world(entries: [bigint, number][]) {
  const { clock, handle, rt } = await createTestRuntime({});
  clock.set(NOW);
  const state = stateWith(entries);
  jest.spyOn(handle.quests, "state").mockReturnValue(state);
  return { handle, rt, tool: lookTool.definition(rt) };
}

function crowd() {
  return [
    selfRow(),
    nearbyRow(
      unitEntity({ dx: 11, guid: ERONA, level: 30, name: "Velan Brightoak" }),
      { relation: "friendly", roles: ["questgiver"] },
    ),
    nearbyRow(
      unitEntity({ dx: 38, guid: JULIA, level: 15, name: "Julia Sunstriker" }),
      { relation: "friendly", roles: ["questgiver"] },
    ),
    nearbyRow(
      unitEntity({
        dx: 58,
        guid: GUARD,
        level: 22,
        name: "Silvermoon Guardian",
      }),
      { relation: "friendly", roles: [] },
    ),
  ];
}

function place(
  handle: Parameters<typeof setWorld>[0],
  rows: ReturnType<typeof crowd>,
) {
  setWorld(handle, {
    place: { area: "Fairbreeze Village", zone: "Eversong Woods" },
    pose: selfPose(NOW),
    rows,
  });
}

describe("look at quest marks", () => {
  test("a giver with a quest to take shows it in the row", async () => {
    const { handle, tool } = await world([[ERONA, 8]]);
    place(handle, crowd());
    const { details, text } = await runTool(tool, {});
    expect(text.split("\n")).toContain(
      "- u1 Velan Brightoak L30 friendly, questgiver, quest available, 11 yd N",
    );
    const after = details.tool === "look" ? details.result.after : undefined;
    expect(after?.rows.find((row) => row.guid === "22")).toMatchObject({
      questMark: "available",
    });
    expect(
      after?.rows.find((row) => row.guid === "24")?.questMark,
    ).toBeUndefined();
    await expectSendKind(lookTool, {});
  });

  test("a turn-in and an in-progress quest show their own words", async () => {
    const { handle, tool } = await world([
      [ERONA, 10],
      [JULIA, 5],
    ]);
    place(handle, crowd());
    const { text } = await runTool(tool, {});
    const lines = text.split("\n");
    expect(lines).toContain(
      "- u1 Velan Brightoak L30 friendly, questgiver, quest to turn in, 11 yd N",
    );
    expect(lines).toContain(
      "- u2 Julia Sunstriker L15 friendly, questgiver, quest in progress, 38 yd N",
    );
    await expectSendKind(lookTool, {});
  });

  test("a gray and a repeatable quest show their own words", async () => {
    const { handle, tool } = await world([
      [ERONA, 2],
      [JULIA, 4],
    ]);
    place(handle, crowd());
    const { text } = await runTool(tool, {});
    const lines = text.split("\n");
    expect(lines).toContain(
      "- u1 Velan Brightoak L30 friendly, questgiver, low-level quest, 11 yd N",
    );
    expect(lines).toContain(
      "- u2 Julia Sunstriker L15 friendly, questgiver, repeatable quest, 38 yd N",
    );
    await expectSendKind(lookTool, {});
  });

  test("find questgiver lists a turn-in and an offer first, then by distance", async () => {
    const { handle, tool } = await world([
      [JULIA, 9],
      [ERONA, 8],
    ]);
    place(handle, crowd());
    const { details, text } = await runTool(tool, { find: "questgiver" });
    const lines = text.split("\n");
    expect(lines[2]).toBe(
      "2 of 2 questgiver units within 60 yd, nearest first:",
    );
    expect(lines[3]).toMatch(/^- u\d+ Julia Sunstriker /);
    expect(lines[4]).toMatch(/^- u\d+ Velan Brightoak /);
    const after = details.tool === "look" ? details.result.after : undefined;
    expect(after?.rows.map((row) => row.guid)).toEqual(["23", "22"]);
    await expectSendKind(lookTool, { find: "questgiver" });
  });

  test("a quest offer outranks a named unit in a cut list", async () => {
    const { handle, rt, tool } = await world([[ERONA, 8]]);
    rt.log.append({
      class: "log",
      data: { text: "Walk to Silvermoon Guardian please" },
      domain: "human",
      event: "human/input",
      text: "Human: Walk to Silvermoon Guardian please",
    });
    place(handle, [
      selfRow(),
      nearbyRow(
        unitEntity({ dx: 25, guid: LYNX, level: 7, name: "Springpaw Lynx" }),
        {
          relation: "hostile",
        },
      ),
      nearbyRow(
        unitEntity({
          dx: 57,
          guid: GUARD,
          level: 22,
          name: "Silvermoon Guardian",
        }),
        {
          relation: "friendly",
          roles: [],
        },
      ),
      nearbyRow(
        unitEntity({ dx: 55, guid: ERONA, level: 30, name: "Velan Brightoak" }),
        {
          relation: "friendly",
          roles: ["questgiver"],
        },
      ),
      nearbyRow(unitEntity({ dx: 5, guid: 0x26n, level: 1, name: "Rabbit" }), {
        relation: "neutral",
      }),
      nearbyRow(unitEntity({ dx: 10, guid: 0x27n, level: 1, name: "Rabbit" }), {
        relation: "neutral",
      }),
      nearbyRow(unitEntity({ dx: 15, guid: 0x28n, level: 1, name: "Rabbit" }), {
        relation: "neutral",
      }),
      nearbyRow(unitEntity({ dx: 20, guid: 0x29n, level: 1, name: "Rabbit" }), {
        relation: "neutral",
      }),
      nearbyRow(
        unitEntity({ dx: 30, guid: 0x2an, level: 5, name: "Stallion" }),
        {
          relation: "neutral",
        },
      ),
    ]);
    const { text } = await runTool(tool, {});
    const lines = text.split("\n");
    expect(lines[2]).toBe("6 of 8 units within 60 yd, most relevant first:");
    expect(lines[3]).toMatch(/^- u\d+ Velan Brightoak /);
    await expectSendKind(lookTool, {});
  });
});
