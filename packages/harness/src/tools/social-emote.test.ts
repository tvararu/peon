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
    await withFakeTimers(async () => {
      const { handle, tool } = await world([partner()]);
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      const act = spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", to: "u1", what: "wave" });
      await elapse(100);
      gate.resolve({ ok: true, textEmote: 101 });
      await elapse(100);
      handle.triggerAreaEvent("emotes", echo("Kaelyn"));
      const out = await pending;
      expect(act.mock.calls[0]?.slice(0, 2)).toEqual(["wave", PARTNER]);
      expect(out.text).toContain("DONE");
      expect(out.text).toContain("wave");
      expect(out.details.result.after).toMatchObject({
        action: "emote",
        confirmed: true,
        to: "Kaelyn",
      });
    });
  });

  async function sendThenEcho(
    emitted: { target: string | undefined; textEmote?: number },
    request: { to?: string },
    rows: NearbyRow[],
  ) {
    return withFakeTimers(async () => {
      const { handle, tool } = await world(rows);
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", what: "wave", ...request });
      await elapse(100);
      gate.resolve({ ok: true, textEmote: 101 });
      await elapse(100);
      handle.triggerAreaEvent("emotes", {
        ...echo(emitted.target),
        ...(emitted.textEmote === undefined
          ? {}
          : { textEmote: emitted.textEmote }),
      });
      await elapse(5000);
      return pending;
    });
  }

  test("an echo with no target does not confirm a targeted emote", async () => {
    const out = await sendThenEcho({ target: undefined }, { to: "u1" }, [
      partner(),
    ]);
    expect(out.details.result.status).toBe("UNCONFIRMED");
  });

  test("an echo at another name does not confirm a targeted emote", async () => {
    const out = await sendThenEcho({ target: "Jaina" }, { to: "u1" }, [
      partner(),
    ]);
    expect(out.details.result.status).toBe("UNCONFIRMED");
  });

  test("an echo for another emote does not confirm the requested one", async () => {
    const out = await sendThenEcho(
      { target: "Kaelyn", textEmote: 34 },
      { to: "u1" },
      [partner()],
    );
    expect(out.details.result.status).toBe("UNCONFIRMED");
  });

  test("an unrelated self echo does not confirm an untargeted emote", async () => {
    const out = await sendThenEcho({ target: "Kaelyn", textEmote: 34 }, {}, []);
    expect(out.details.result.status).toBe("UNCONFIRMED");
  });

  test("a delayed echo from an earlier request does not confirm the later one", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world([partner()]);
      const ids = [101, 34];
      spyOn(handle.emotes.act, "textEmote").mockImplementation(async () => ({
        ok: true,
        textEmote: ids.shift() ?? 101,
      }));
      const first = runTool(tool, { do: "emote", to: "u1", what: "wave" });
      await elapse(5000);
      const retried = runTool(tool, { do: "emote", to: "u1", what: "dance" });
      await elapse(5000);
      handle.triggerAreaEvent("emotes", echo("Kaelyn"));
      await elapse(5000);
      for (const out of [await first, await retried])
        expect(out.details.result.status).toBe("UNCONFIRMED");
      expect(handle.emotes.act.textEmote).toHaveBeenCalledTimes(2);
    });
  });

  test("an earlier echo arriving while the act is queued does not confirm the later send", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world([partner()]);
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", to: "u1", what: "wave" });
      await elapse(500);
      handle.triggerAreaEvent("emotes", echo("Kaelyn"));
      gate.resolve({ ok: true, textEmote: 101 });
      await elapse(5000);
      expect((await pending).details.result.status).toBe("UNCONFIRMED");
    });
  });

  test("an echo for the sent request still confirms", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world([partner()]);
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", to: "u1", what: "wave" });
      await elapse(500);
      gate.resolve({ ok: true, textEmote: 101 });
      await elapse(100);
      handle.triggerAreaEvent("emotes", echo("Kaelyn"));
      expect((await pending).details.result.status).toBe("DONE");
    });
  });

  test("an abort during the echo wait releases every echo listener", async () => {
    await withFakeTimers(async () => {
      const { handle, rt } = await world([partner()]);
      let live = 0;
      const onEvent = handle.emotes.onEvent.bind(handle.emotes);
      spyOn(handle.emotes, "onEvent").mockImplementation((cb) => {
        live += 1;
        const off = onEvent(cb);
        return () => {
          live -= 1;
          off();
        };
      });
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
        ok: true,
        textEmote: 101,
      });
      const controller = new AbortController();
      const pending = runTool(
        socialTool.definition(rt),
        { do: "emote", to: "u1", what: "wave" },
        { signal: controller.signal },
      );
      await elapse(500);
      controller.abort(new Error("stopped"));
      await elapse(10);
      expect((await pending).details.result.status).toBe("FAILED");
      expect(live).toBe(0);
    });
  });

  test("a pre-aborted call releases the echo listener", async () => {
    const { handle, rt } = await world([partner()]);
    let live = 0;
    const onEvent = handle.emotes.onEvent.bind(handle.emotes);
    spyOn(handle.emotes, "onEvent").mockImplementation((cb) => {
      live += 1;
      const off = onEvent(cb);
      return () => {
        live -= 1;
        off();
      };
    });
    const controller = new AbortController();
    controller.abort(new Error("stopped"));
    const act = spyOn(handle.emotes.act, "textEmote");
    const out = await runTool(
      socialTool.definition(rt),
      { do: "emote", to: "u1", what: "wave" },
      { signal: controller.signal },
    );
    expect(out.details.result.status).toBe("FAILED");
    expect(act).not.toHaveBeenCalled();
    expect(live).toBe(0);
  });

  test("without to the emote has no target", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      const act = spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", what: "dance" });
      await elapse(100);
      gate.resolve({ ok: true, textEmote: 34 });
      await elapse(100);
      handle.triggerAreaEvent("emotes", {
        ...echo(undefined),
        textEmote: 34,
      });
      const out = await pending;
      expect(act.mock.calls[0]?.slice(0, 2)).toEqual(["dance", undefined]);
      expect(out.details.result.status).toBe("DONE");
    });
  });

  test("an echo from another unit does not confirm the emote", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      const gate = Promise.withResolvers<{ ok: true; textEmote: number }>();
      spyOn(handle.emotes.act, "textEmote").mockImplementation(
        () => gate.promise,
      );
      const pending = runTool(tool, { do: "emote", what: "wave" });
      await elapse(100);
      gate.resolve({ ok: true, textEmote: 101 });
      await elapse(100);
      handle.triggerAreaEvent("emotes", { ...echo(undefined), self: false });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("UNCONFIRMED");
      expect(out.details.result.after.confirmed).toBe(false);
    });
  });

  test("no echo is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
        ok: true,
        textEmote: 101,
      });
      const pending = runTool(tool, { do: "emote", what: "wave" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("UNCONFIRMED");
    });
  });

  test("an unknown emote is REFUSED with the closest names", async () => {
    await withFakeTimers(async () => {
      const { handle, tool } = await world();
      spyOn(handle.emotes.act, "textEmote").mockResolvedValue({
        closest: ["wave", "waive", "wail", "wake", "walk"],
        ok: false,
        reason: "unknown_emote",
      });
      const pending = runTool(tool, { do: "emote", what: "wavv" });
      await elapse(5000);
      const out = await pending;
      expect(out.details.result.status).toBe("REFUSED");
      expect(out.details.result.reason).toBe("unknown_emote");
      for (const name of ["wave", "waive", "wail", "wake", "walk"])
        expect(out.text).toContain(name);
    });
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

  test("the social tool definition runs sequentially", async () => {
    const { tool } = await world();
    expect(tool.executionMode).toBe("sequential");
  });
});
