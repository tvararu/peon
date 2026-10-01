import { describe, expect, spyOn, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { socialTool } from "#harness/tools/social";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

const PARTNER = 0x77n;

async function world(rows: NearbyRow[] = []) {
  const clock = { now: () => 1000 };
  const { handle, rt } = await createTestRuntime({
    parts: {
      clock,
      refs: createRefTable(),
      sightings: createSightings(clock),
    },
  });
  setWorld(handle, { pose: selfPose(1000), rows: [selfRow(), ...rows] });
  return { handle, rt, tool: socialTool.definition(rt) };
}

const partner = () =>
  nearbyRow(unitEntity({ dx: 3, guid: PARTNER, health: 100, name: "Kaelyn" }), {
    relation: "friendly",
  });

function echo(target: string | undefined) {
  return {
    emoteNum: 67,
    guid: 0n,
    self: true,
    target,
    textEmote: 101,
    type: "text_emote",
  } as const;
}

describe("social do:emote", () => {
  test("resolves the ref, sends the text emote and settles on the self echo", async () => {
    const { handle, tool } = await world([partner()]);
    const act = spyOn(handle.emotes.act, "textEmote").mockImplementation(
      async () => {
        handle.triggerAreaEvent("emotes", echo("Kaelyn"));
        return { ok: true };
      },
    );
    const out = await runTool(tool, { do: "emote", to: "u1", what: "wave" });
    expect(act).toHaveBeenCalledWith("wave", PARTNER);
    expect(out.text).toContain("DONE");
    expect(out.text).toContain("wave");
    expect(out.details.result.after).toMatchObject({
      action: "emote",
      confirmed: true,
      to: "Kaelyn",
    });
  });

  test("without to the emote has no target", async () => {
    const { handle, tool } = await world();
    const act = spyOn(handle.emotes.act, "textEmote").mockImplementation(
      async () => {
        handle.triggerAreaEvent("emotes", echo(undefined));
        return { ok: true };
      },
    );
    const out = await runTool(tool, { do: "emote", what: "dance" });
    expect(act).toHaveBeenCalledWith("dance", undefined);
    expect(out.details.result.status).toBe("DONE");
  });

  test("an echo from another unit does not confirm the emote", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockImplementation(async () => {
        handle.triggerAreaEvent("emotes", { ...echo(undefined), self: false });
        return { ok: true };
      });
      const pending = runTool(tool, { do: "emote", what: "wave" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("UNCONFIRMED");
      expect(out.details.result.after.confirmed).toBe(false);
    });
  });

  test("no echo is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({ ok: true });
      const pending = runTool(tool, { do: "emote", what: "wave" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("UNCONFIRMED");
    });
  });

  test("an unknown emote is REFUSED with the closest names", async () => {
    const { handle, tool } = await world();
    spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
      closest: ["wave", "waive", "wail", "wake", "walk"],
      ok: false,
      reason: "unknown_emote",
    });
    const out = await runTool(tool, { do: "emote", what: "wavv" });
    expect(out.details.result.status).toBe("REFUSED");
    expect(out.details.result.reason).toBe("unknown_emote");
    for (const name of ["wave", "waive", "wail", "wake", "walk"])
      expect(out.text).toContain(name);
  });

  test("a ready check is REFUSED and points to group play", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
        ok: false,
        reason: "ready_check",
      });
      const pending = runTool(tool, { do: "emote", what: "ready" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("REFUSED");
      expect(out.details.result.reason).toBe("ready_check");
      expect(out.details.result.next).toContain("group");
    });
  });

  test("a dead character is REFUSED dead", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
        ok: false,
        reason: "dead",
      });
      const pending = runTool(tool, { do: "emote", what: "wave" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("REFUSED");
      expect(out.details.result.reason).toBe("dead");
    });
  });

  test("a missing emote name is REFUSED before anything is sent", async () => {
    const { handle, tool } = await world();
    const act = spyOn(handle.emotes.act, "textEmote");
    const out = await runTool(tool, { do: "emote" });
    expect(out.details.result.status).toBe("REFUSED");
    expect(out.details.result.reason).toBe("missing_emote");
    expect(act).not.toHaveBeenCalled();
  });

  test("a target that was never seen is REFUSED before anything is sent", async () => {
    const { handle, tool } = await world();
    const act = spyOn(handle.emotes.act, "textEmote");
    const out = await runTool(tool, { do: "emote", to: "u9", what: "wave" });
    expect(out.details.result.status).toBe("REFUSED");
    expect(out.details.result.reason).toBe("not_seen");
    expect(act).not.toHaveBeenCalled();
  });

  test("an aborted run surfaces FAILED before anything is sent", async () => {
    const { handle, rt } = await world();
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    const act = spyOn(handle.emotes.act, "textEmote");
    const tool = socialTool.definition(rt);
    const out = await runTool(
      tool,
      { do: "emote", what: "wave" },
      {
        signal: controller.signal,
      },
    );
    expect(out.details.result.status).toBe("FAILED");
    expect(out.text).toContain("stopped");
    expect(act).not.toHaveBeenCalled();
  });

  test("the tool is an action", () => {
    expect(socialTool.kind).toBe("action");
  });
});
