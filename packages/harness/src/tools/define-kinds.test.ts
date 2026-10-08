import { describe, expect, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import type { SocialAfter } from "#harness/contract/details";
import type { ToolKind } from "#harness/contract/result";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec } from "#harness/tools/game-tool";
import { PROBE } from "#test-support/probe-tool";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

const params = Type.Object({});
type Run = GameToolSpec<typeof params, "social", SocialAfter>["run"];

const after: SocialAfter = {
  action: "say",
  confirmed: false,
  systemLine: undefined,
  text: undefined,
  to: undefined,
};

function probe(run: Run, kind: ToolKind) {
  return defineGameTool({
    ...PROBE,
    fallback: () => after,
    kind,
    name: "social",
    parameters: params,
    run,
  });
}

const silent: Run = () =>
  Promise.resolve(result("DONE", { after, detail: "said hi." }));

const sends: Run = async (_args, ctx) => {
  ctx.handle.achievements.act.setTitle(undefined);
  return result("DONE", { after, detail: "said hi." });
};

describe("tool kind and execution mode", () => {
  test.each([
    ["read", "parallel"],
    ["control", "sequential"],
    ["action", "sequential"],
    ["run", "sequential"],
  ] as const)("a %s tool executes %s", async (kind, mode) => {
    const { rt } = await createTestRuntime();
    expect(probe(silent, kind).definition(rt).executionMode).toBe(mode);
  });
});

describe("expectSendKind", () => {
  test.each(["read", "control"] as const)(
    "a %s tool that sends fails the check",
    async (kind) => {
      await expect(expectSendKind(probe(sends, kind), {})).rejects.toThrow(
        `social is kind ${kind} but sent 1 packet`,
      );
    },
  );

  test.each(["action", "run"] as const)(
    "a %s tool that sends nothing fails the check",
    async (kind) => {
      await expect(expectSendKind(probe(silent, kind), {})).rejects.toThrow(
        `social is kind ${kind} but sent no packets`,
      );
    },
  );

  test.each(["action", "run"] as const)(
    "a %s tool that sends passes the check",
    async (kind) => {
      await expectSendKind(probe(sends, kind), {});
    },
  );

  test.each(["read", "control"] as const)(
    "a %s tool that sends nothing passes the check",
    async (kind) => {
      await expectSendKind(probe(silent, kind), {});
    },
  );
});
