import { describe, expect, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import type { SocialAfter } from "#harness/contract/details";
import type { RunEnd } from "#harness/contract/runs";
import {
  defineGameTool,
  type GameToolSpec,
  result,
  type ToolKind,
} from "#harness/tools/define";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

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

describe("acting-tool admission", () => {
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

  test("refuses an action while the human drives; a read still runs", async () => {
    const { rt } = await createTestRuntime();
    rt.control.claim("human", "drive");
    expect((await runTool(probe(said)(rt), {})).details.result).toMatchObject({
      reason: "human_driving",
      status: "REFUSED",
    });
    expect((await runTool(probe(said, "read")(rt), {})).text).toBe(
      "DONE said hi.",
    );
    expect(rt.control.owner()).toBe("human");
    rt.control.release("human", "hand_back");
    expect((await runTool(probe(said)(rt), {})).text).toBe("DONE said hi.");
    expect(rt.control.owner()).toBe("agent");
  });

  test("an action beside a background run leaves the run and the loop's hold alone", async () => {
    const { rt } = await createTestRuntime();
    const run = rt.runs.start({
      args: {},
      kind: "travel",
      launch: () => Promise.withResolvers<RunEnd<undefined>>().promise,
      toolCallId: "t0",
    });
    rt.control.claim("loop", "run_outlived_turn");
    expect((await runTool(probe(said)(rt), {})).text).toBe("DONE said hi.");
    expect(rt.runs.get(run.id)?.status).toBe("running");
    expect(rt.control.owner()).toBe("loop");
  });

  test("the human_waiting refusal quotes the pending message", async () => {
    const { rt } = await createTestRuntime();
    rt.session.humanWaiting = true;
    rt.session.humanTexts = [
      "Get back to your body. Don't use the spirit healer.",
    ];
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "REFUSED human_waiting: the human wrote: \"Get back to your body. Don't use the spirit healer.\" Read it before you act.\nNext: end your turn and read the human's message.",
    );
    rt.session.humanTexts = ["x".repeat(300)];
    expect((await runTool(probe(said)(rt), {})).text).toContain(
      `"${"x".repeat(200)}..."`,
    );
    rt.session.humanTexts = ["rest first", "then  sell\nthe fangs"];
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      'REFUSED human_waiting: the human wrote 2 messages: "rest first", then "then sell the fangs" Read it before you act.\nNext: end your turn and read the human\'s message.',
    );
  });
});
