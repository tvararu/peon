import { describe, expect, jest, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import type { LookAfter, SocialAfter } from "#harness/contract/details";
import type {
  HarnessRuntime,
  ProgressTracker,
  ReadyGate,
} from "#harness/contract/services";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { createRepeatGuard } from "#harness/ops/repeat-guard";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
import {
  defineGameTool,
  type GameToolSpec,
  result,
  type ToolKind,
  TURN_BUDGET,
  UPDATE_EVERY_MS,
} from "#harness/tools/define";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, setWorld, unitEntity } from "#test-support/world-fixtures";

const params = Type.Object({ text: Type.Optional(Type.String()) });
type Run = GameToolSpec<typeof params, "social">["run"];

function emptySocial(): SocialAfter {
  return {
    action: "say",
    confirmed: false,
    systemLine: undefined,
    text: undefined,
    to: undefined,
  };
}

function probe(run: Run, kind: ToolKind = "action") {
  return defineGameTool({
    fallback: emptySocial,
    kind,
    name: "social",
    parameters: params,
    run,
  });
}

const said: Run = () =>
  Promise.resolve(result("DONE", { after: emptySocial(), detail: "said hi." }));
const tooFar = () =>
  jest.fn((): never => {
    throw new Refusal({
      detail: "the NPC is 40 yd away.",
      next: 'travel(to: "u3")',
      reason: "too_far",
    });
  });

function fixedProgress(): ProgressTracker {
  return {
    afterAction: () => {},
    attach: () => () => {},
    count: () => 0,
    digest: () => "same",
    lastProgress: () => undefined,
    noProgress: () => undefined,
  };
}

const notReady: ReadyGate = {
  attach: () => () => {},
  inWorld: () => undefined,
  isReady: () => false,
  onReady: () => () => {},
  whenReady: () => Promise.resolve(false),
};

function toolRows(rt: HarnessRuntime) {
  return rt.log.recent(50).filter((entry) => entry.domain === "tool");
}

describe("defineGameTool", () => {
  test("a DONE result starts with the status word and logs the call and the result", async () => {
    const { rt } = await createTestRuntime();
    const out = await runTool(probe(said)(rt), {});
    expect(out.text).toBe("DONE said hi.");
    expect(out.details).toEqual({
      result: {
        after: emptySocial(),
        body: [],
        detail: "said hi.",
        status: "DONE",
      },
      tool: "social",
    });
    expect(toolRows(rt).map((entry) => entry.event)).toEqual([
      "tool/call",
      "tool/result",
    ]);
    expect(rt.session.turnToolCalls).toBe(1);
  });

  test("the definition carries TOOL_TEXT and the execution mode", async () => {
    const { rt } = await createTestRuntime();
    const tool = probe(said, "read")(rt);
    expect(tool).toMatchObject({
      description: TOOL_TEXT.social.description,
      executionMode: "parallel",
      label: TOOL_TEXT.social.label,
      name: "social",
    });
    expect(tool.promptGuidelines).toEqual(TOOL_TEXT.social.guidelines);
    expect(probe(said)(rt).executionMode).toBe("sequential");
  });

  test("refuses over the turn budget without running", async () => {
    const { rt } = await createTestRuntime();
    rt.session.turnToolCalls = TURN_BUDGET;
    const run = jest.fn(said);
    expect((await runTool(probe(run)(rt), {})).text).toBe(
      "REFUSED turn_budget: report to the human now.\nNext: end your turn and report to the human.",
    );
    expect(run).not.toHaveBeenCalled();
  });

  test("refuses offline", async () => {
    const { rt } = await createTestRuntime({ connect: false });
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "REFUSED offline: the game connection is down.\nNext: ask the human to run /connect.",
    );
  });

  test("refuses an action while a human message waits; a read still runs", async () => {
    const { rt } = await createTestRuntime();
    rt.session.humanWaiting = true;
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "REFUSED human_waiting: the human wrote a message. Read it before you act.\nNext: end your turn and read the human's message.",
    );
    expect((await runTool(probe(said, "read")(rt), {})).text).toBe(
      "DONE said hi.",
    );
    expect((await runTool(probe(said, "control")(rt), {})).text).toBe(
      "DONE said hi.",
    );
  });

  test("refuses before the world is ready", async () => {
    const { rt } = await createTestRuntime({
      parts: { ready: notReady },
      ready: false,
    });
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "REFUSED not_ready: the world is still loading.\nNext: call look again in a few seconds.",
    );
  });

  test("refuses an exact repeat of a failed call without running it", async () => {
    const { rt } = await createTestRuntime({
      parts: {
        progress: fixedProgress(),
        repeats: createRepeatGuard({ now: () => 0 }),
      },
    });
    const run = tooFar();
    const tool = probe(run)(rt);
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'REFUSED too_far: the NPC is 40 yd away.\nNext: travel(to: "u3")',
    );
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'REFUSED repeat: you already tried this from here and it failed (too_far).\nUntried: travel(to: "u3")\nNext: travel(to: "u3")',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("a Next that repeats the call keeps it until a repeat makes no progress", async () => {
    const { rt } = await createTestRuntime({
      parts: {
        progress: fixedProgress(),
        repeats: createRepeatGuard({ now: () => 0 }),
      },
    });
    const run: Run = () =>
      Promise.resolve(
        result("PARTLY", {
          after: emptySocial(),
          detail: "said half.",
          next: 'social(text: "a")',
          reason: "cut_off",
        }),
      );
    const tool = probe(run)(rt);
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'PARTLY cut_off: said half.\nNext: social(text: "a")',
    );
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'PARTLY cut_off: said half.\nNext: ask the human: "My social call stopped (cut_off) and repeating it will not help. What should I do?"',
    );
  });

  test("a repeat that made progress keeps the same call as its Next", async () => {
    let at: number | undefined;
    const { rt } = await createTestRuntime({
      parts: {
        progress: {
          ...fixedProgress(),
          lastProgress: () =>
            at === undefined ? undefined : { at, event: "combat/kill_credit" },
        },
        repeats: createRepeatGuard({ now: () => 0 }),
      },
    });
    const run: Run = () => {
      at = rt.clock.now();
      return Promise.resolve(
        result("PARTLY", {
          after: emptySocial(),
          detail: "said half.",
          next: 'social(text: "a")',
          reason: "cut_off",
        }),
      );
    };
    const tool = probe(run)(rt);
    await runTool(tool, { text: "a" });
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'PARTLY cut_off: said half.\nNext: social(text: "a")',
    );
  });

  test("a timed PARTLY keeps the same call as its Next", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = () =>
      Promise.resolve(
        result("PARTLY", {
          after: emptySocial(),
          detail: "rested 30 s.",
          next: 'social(text: "a")',
          reason: "time_limit",
        }),
      );
    const out = await runTool(probe(run)(rt), { text: "a" });
    expect(out.text).toBe(
      'PARTLY time_limit: rested 30 s.\nNext: social(text: "a")',
    );
  });

  test("a Next that already failed from here asks the human", async () => {
    const { rt } = await createTestRuntime({
      parts: {
        progress: fixedProgress(),
        repeats: createRepeatGuard({ now: () => 0 }),
      },
    });
    const travel = defineGameTool({
      fallback: emptySocial,
      kind: "action",
      name: "travel",
      parameters: Type.Object({ to: Type.String() }),
      run: (): never => {
        throw new Refusal({
          detail: "no ground.",
          next: 'ask the human: "Another way?"',
          reason: "no_ground",
          status: "FAILED",
        });
      },
    } as unknown as GameToolSpec<typeof params, "social">)(rt);
    await runTool(travel, { to: "u3" });
    const out = await runTool(probe(tooFar())(rt), { text: "a" });
    expect(out.text).toBe(
      'REFUSED too_far: the NPC is 40 yd away.\nNext: ask the human: "My social call failed (too_far) and travel already failed from here. What should I do?"',
    );
  });

  test("look is never blocked by the repeat guard", async () => {
    const { rt } = await createTestRuntime({
      parts: {
        progress: fixedProgress(),
        repeats: createRepeatGuard({ now: () => 0 }),
      },
    });
    const run = jest.fn((): never => {
      throw new Refusal({ detail: "odd.", next: "look()", reason: "odd" });
    });
    const look = defineGameTool({
      fallback: () => ({}) as LookAfter,
      kind: "read",
      name: "look",
      parameters: params,
      run,
    })(rt);
    await runTool(look, {});
    expect((await runTool(look, {})).text).toStartWith("REFUSED odd:");
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("maps a core throw to a typed refusal", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = () => Promise.reject(new Error("self_not_alive"));
    expect((await runTool(probe(run)(rt), {})).text).toBe(
      "REFUSED dead: you are dead.\nNext: recover()",
    );
  });

  test("Esc on the Pi signal halts everything", async () => {
    const { handle, rt } = await createTestRuntime();
    const controller = new AbortController();
    const run: Run = () => {
      controller.abort();
      return Promise.resolve(
        result("FAILED", {
          after: emptySocial(),
          detail: "stopped.",
          next: "look()",
          reason: "esc",
        }),
      );
    };
    await runTool(probe(run, "run")(rt), {}, { signal: controller.signal });
    expect(handle.halt).toHaveBeenCalled();
  });

  test("a human stop becomes FAILED cancelled", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = () =>
      Promise.resolve(
        result("FAILED", {
          after: emptySocial(),
          detail: "run stopped.",
          reason: "human_stop",
        }),
      );
    expect((await runTool(probe(run, "run")(rt), {})).text).toBe(
      "FAILED cancelled: the human stopped you. Start nothing new.\nNext: end your turn and wait for the human.",
    );
  });

  test("streams RUNNING partials at most once per UPDATE_EVERY_MS", async () => {
    const { clock, rt } = await createTestRuntime();
    const run: Run = (_args, ctx) => {
      const partial = result("DONE", {
        after: emptySocial(),
        detail: "walking.",
        runId: "r1",
      });
      ctx.update(partial);
      ctx.update(partial);
      clock.advance(UPDATE_EVERY_MS);
      ctx.update({ ...partial, detail: "still walking." });
      return Promise.resolve(
        result("DONE", { after: emptySocial(), detail: "arrived." }),
      );
    };
    const out = await runTool(probe(run, "run")(rt), {});
    expect(
      out.updates.map((details) => [
        details.result.status,
        details.result.detail,
      ]),
    ).toEqual([
      ["RUNNING", "walking."],
      ["RUNNING", "still walking."],
    ]);
  });

  test("a refusal after a partial keeps the partial's after", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = (_args, ctx) => {
      ctx.update(
        result("RUNNING", {
          after: { ...emptySocial(), text: "half" },
          detail: "x.",
          runId: "r1",
        }),
      );
      throw new Refusal({
        detail: "lost the target.",
        next: "look()",
        reason: "lost",
      });
    };
    const out = await runTool(probe(run, "run")(rt), {});
    expect(out.details.result.after).toMatchObject({ text: "half" });
  });

  test("marks evidence rows as consumed by the call", async () => {
    const { rt } = await createTestRuntime();
    const row = rt.log.append({
      class: "passive",
      data: {},
      domain: "loot",
      event: "loot/item",
      text: "item Lynx Meat x1",
    });
    const run: Run = () =>
      Promise.resolve(
        result("DONE", {
          after: emptySocial(),
          detail: "looted.",
          evidence: [{ domain: "loot", event: "loot/item", seq: row.seq }],
        }),
      );
    await runTool(probe(run)(rt), {}, { id: "call-9" });
    expect(rt.log.get(row.seq)?.consumedBy).toBe("call-9");
  });

  test("never logs the password", async () => {
    const { rt } = await createTestRuntime();
    rt.profile.client.password = "pw1";
    await runTool(probe(said)(rt), { text: "my password is pw1" });
    const call = toolRows(rt).find((entry) => entry.event === "tool/call");
    expect(call?.data["args"]).toEqual({ text: "my password is [secret]" });
  });

  test("appends the danger line while a unit attacks", async () => {
    const { handle, rt } = await createTestRuntime({
      parts: {
        attacks: createAttackLedger({ now: () => 0 }),
        refs: createRefTable(),
      },
    });
    setWorld(handle, {
      combat: { attackers: [0x50n] },
      rows: [nearbyRow(unitEntity({ guid: 0x50n, name: "Springpaw Stalker" }))],
    });
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "DONE said hi.\nDanger: Springpaw Stalker u1 is attacking you. You are at 100% HP.",
    );
  });
});
