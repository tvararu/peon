import { describe, expect, jest, test } from "bun:test";
import {
  type AreaState,
  type Entity,
  ObjectType,
  type PlayerLife,
  UnitFlag,
} from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import type { GroupAfter } from "#harness/areas/raid/tool-shared";
import { setSelf, toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const TOM = 0x100n;

type RaidState = AreaState<"raid">;

type Setup = {
  attackers?: readonly bigint[];
  life?: PlayerLife;
  pending?: boolean;
  selfFlags?: number;
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const raid: RaidState = {
    group: undefined,
    marks: Array.from({ length: 8 }, () => 0n),
    readyCheck: undefined,
    stats: new Map(),
    summon:
      setup.pending === false
        ? undefined
        : {
            expiresAt: 120_000,
            name: "Tom",
            summoner: TOM,
            zoneId: 1637,
            zoneName: "Orgrimmar",
          },
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(raid);
  const answer = jest
    .spyOn(t.handle.raid.act, "answerSummon")
    .mockImplementation(() => undefined);
  setSelf(t.handle, { life: setup.life ?? "alive" });
  const selfGuid = t.handle.getControlState().selfGuid;
  const selfEntity = {
    guid: selfGuid,
    objectType: ObjectType.PLAYER,
    target: 0n,
    unitFlags: setup.selfFlags ?? 0,
  } as Entity;
  t.handle.getEntity = (() => selfEntity) as typeof t.handle.getEntity;
  const armed = t.handle.getCombatState();
  t.handle.getCombatState = () => ({
    ...armed,
    attackers: setup.attackers ? [...setup.attackers] : [],
  });
  const jump = (reason: string) =>
    t.handle.triggerControlEvent({
      reason,
      state: t.handle.getControlState(),
      type: "server_correction",
    });
  return { ...t, answer, jump, tool: groupTool.definition(t.rt) };
}

describe("group tool summon", () => {
  test("refuses when no summon is pending", async () => {
    const t = await world({ pending: false });
    const out = await runTool(t.tool, { do: "summon", what: "accept" });
    expect(out.text).toContain("REFUSED no_summon");
    expect(t.answer).not.toHaveBeenCalled();
  });

  test("refuses dead, ghost and tracked combat, which the server drops", async () => {
    for (const setup of [
      { life: "dead" as const },
      { life: "ghost" as const },
      { attackers: [7n] },
    ]) {
      const t = await world(setup);
      const accept = await runTool(t.tool, { do: "summon", what: "accept" });
      expect(accept.text).toContain("REFUSED");
      const decline = await runTool(t.tool, { do: "summon", what: "decline" });
      expect(decline.text).toContain("REFUSED");
      expect(t.answer).not.toHaveBeenCalled();
    }
  });

  test("refuses accept and decline when only the self combat flag is set", async () => {
    for (const what of ["accept", "decline"] as const) {
      const t = await world({ selfFlags: UnitFlag.IN_COMBAT });
      const out = await runTool(t.tool, { do: "summon", what });
      expect(out.text).toContain("REFUSED in_combat");
      expect(t.answer).not.toHaveBeenCalled();
    }
  });

  test("refuses an unclear answer before sending", async () => {
    const t = await world();
    const missing = await runTool(t.tool, { do: "summon" });
    expect(missing.text).toContain("REFUSED bad_answer");
    const odd = await runTool(t.tool, { do: "summon", what: "maybe" });
    expect(odd.text).toContain("REFUSED bad_answer");
    expect(t.answer).not.toHaveBeenCalled();
  });

  test("decline settles done at once", async () => {
    const t = await world();
    const out = await runTool(t.tool, { do: "summon", what: " Decline " });
    expect(t.answer).toHaveBeenCalledTimes(1);
    expect(t.answer).toHaveBeenCalledWith(false);
    expect(out.text).toContain("DONE");
    expect(out.details.result.after).toMatchObject({ do: "summon" });
  });

  test("accept is done when a teleport or a new world arrives", async () => {
    for (const reason of ["teleport", "new_world", "near_teleport"]) {
      const t = await world();
      t.answer.mockImplementation(() => t.jump(reason));
      const out = await runTool(t.tool, { do: "summon", what: "accept" });
      expect(t.answer).toHaveBeenCalledWith(true);
      expect(out.text).toContain("DONE");
    }
  });

  test("accept ignores other corrections and stays unconfirmed", async () => {
    const t = await world();
    t.answer.mockImplementation(() => {
      t.jump("speed_change");
      return elapse(5000);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "summon", what: "accept" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("a jump after the wait ends is not counted", async () => {
    const t = await world();
    t.answer.mockImplementation(() => elapse(5000));
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "summon", what: "accept" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
    expect(() => t.jump("teleport")).not.toThrow();
  });

  test("fails when the send throws", async () => {
    const t = await world();
    t.answer.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "summon", what: "accept" });
    expect(out.text).toContain("FAILED");
  });

  test("a request that expired at send time is refused", async () => {
    const t = await world();
    t.answer.mockImplementation(() => {
      throw new Error("no_summon");
    });
    const out = await runTool(t.tool, { do: "summon", what: "accept" });
    expect(out.text).toContain("REFUSED no_summon");
  });

  test("an aborted run ends the wait before sending", async () => {
    const t = await world();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "summon", what: "accept" },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(t.answer).not.toHaveBeenCalled();
  });

  test("a pre-aborted decline sends nothing and keeps the offer", async () => {
    const t = await world();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "summon", what: "decline" },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(t.answer).not.toHaveBeenCalled();
    expect(t.handle.raid.state().summon).toBeDefined();
  });

  test("a decline aborted while queued sends nothing", async () => {
    const t = await world();
    const abort = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = groupSpec.run(
      { do: "summon", what: "decline" },
      toolCtx<GroupAfter>(t, abort.signal),
    );
    const held = t.rt.mutex.run(() => gate);
    const second = groupSpec.run(
      { do: "summon", what: "decline" },
      toolCtx<GroupAfter>(t, new AbortController().signal),
    );
    abort.abort(new Error("cancelled"));
    release();
    await held;
    await expect(first).rejects.toThrow("cancelled");
    await second;
    expect(t.answer).toHaveBeenCalledTimes(1);
  });
});
