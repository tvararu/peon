import { describe, expect, spyOn, test } from "bun:test";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/reputation-settings";

type Row = ReturnType<MockHandle["reputation"]["state"]>["factions"][number];

function row(repListId: number, name: string, over: Partial<Row> = {}): Row {
  return {
    atWar: false,
    changedAt: undefined,
    factionId: undefined,
    inactive: false,
    name,
    rank: undefined,
    rankCeiling: undefined,
    rankFloor: undefined,
    repListId,
    standing: 0,
    visible: true,
    watched: false,
    ...over,
  };
}

function context(args: Record<string, string>, factions: Row[]) {
  const handle = createMockHandle();
  spyOn(handle.reputation, "state").mockReturnValue({
    catalog: true,
    factions,
    forced: [],
    watched: undefined,
  });
  const calls: string[] = [];
  spyOn(handle.reputation.act, "setWatched").mockImplementation(async (id) => {
    calls.push(`watched ${id}`);
    return { sent: true };
  });
  spyOn(handle.reputation.act, "setInactive").mockImplementation((id, on) => {
    calls.push(`inactive ${id} ${on}`);
    return { sent: true };
  });
  spyOn(handle.reputation.act, "setAtWar").mockImplementation((id, on) => {
    calls.push(`war ${id} ${on}`);
    return { sent: true };
  });
  const ctx: FlowContext = { args, handle, settle: settleWithin(50) };
  return { calls, ctx };
}

const rows = [
  row(0, "Bloodsail Buccaneers", { atWar: true, visible: false }),
  row(55, "Silvermoon City"),
];

describe("reputation-settings flow", () => {
  test("by default watches the capital, marks it inactive and clears war with the pirates", async () => {
    const { calls, ctx } = context({}, rows);
    const out = (await flow.run(ctx)) as { results: Record<string, unknown> };
    expect(calls).toEqual(["watched 55", "inactive 55 true", "war 0 false"]);
    expect(out.results).toEqual({
      setAtWar: { sent: true },
      setInactive: { sent: true },
      setWatched: { sent: true },
    });
  });

  test("do=show sends nothing and prints both rows", async () => {
    const { calls, ctx } = context({ do: "show" }, rows);
    const out = (await flow.run(ctx)) as {
      after: { factions: { name: string; atWar: boolean }[] };
    };
    expect(calls).toEqual([]);
    expect(out.after.factions.map((f) => [f.name, f.atWar])).toEqual([
      ["Silvermoon City", false],
      ["Bloodsail Buccaneers", true],
    ]);
  });

  test("do=restore undoes the three settings", async () => {
    const { calls, ctx } = context({ do: "restore" }, rows);
    await flow.run(ctx);
    expect(calls).toEqual([
      "war 0 true",
      "inactive 55 false",
      "watched undefined",
    ]);
  });

  test("a character without the factions gets a clear error and nothing is sent", async () => {
    const { calls, ctx } = context({}, [row(3, "Other")]);
    await expect(flow.run(ctx)).rejects.toThrow("Silvermoon City");
    expect(calls).toEqual([]);
  });

  test("an unknown mode is refused", async () => {
    const { ctx } = context({ do: "x" }, rows);
    await expect(flow.run(ctx)).rejects.toThrow("do=");
  });
});
