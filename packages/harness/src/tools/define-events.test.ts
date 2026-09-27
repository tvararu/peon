import { describe, expect, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import type { SocialAfter } from "#harness/contract/details";
import { defineGameTool, result } from "#harness/tools/define";
import { PROBE } from "#test-support/probe-tool";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const params = Type.Object({});

const after: SocialAfter = {
  action: "say",
  confirmed: false,
  systemLine: undefined,
  text: undefined,
  to: undefined,
};

describe("passive rows during a call", () => {
  test("go into the result once and are marked delivered", async () => {
    const { rt } = await createTestRuntime();
    const tool = defineGameTool({
      ...PROBE,
      fallback: () => after,
      kind: "action",
      name: "social",
      parameters: params,
      run: () => {
        rt.log.append({
          class: "passive",
          data: { source: "exploration" },
          delivered: false,
          domain: "xp",
          event: "xp/gain",
          text: "You gain 55 XP (exploring Ghostlands).",
        });
        return Promise.resolve(result("DONE", { after, detail: "said hi." }));
      },
    });
    const out = await runTool(tool.definition(rt), {}, { id: "call-7" });
    expect(out.text.split("\n").at(-1)).toBe(
      "[game 0s] You gain 55 XP (exploring Ghostlands).",
    );
    const row = rt.log.since(0).find((entry) => entry.event === "xp/gain");
    expect(row).toMatchObject({ consumedBy: "call-7", delivered: true });
  });
});
