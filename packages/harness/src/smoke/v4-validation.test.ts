import { afterEach, expect, test } from "bun:test";
import {
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

type Seen = {
  toolResults: string[];
  executionEnds: { isError: boolean; text: string }[];
};

function countTool(seen: Seen): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      description: "Count to n.",
      execute: async () => ({
        content: [{ text: "counted", type: "text" }],
        details: {},
      }),
      label: "count",
      name: "count",
      parameters: Type.Object({ n: Type.Integer({ minimum: 1 }) }),
    });
    pi.on("tool_result", (event) => void seen.toolResults.push(event.toolName));
    pi.on("tool_execution_end", (event) => {
      const text = JSON.stringify(event.result);
      seen.executionEnds.push({ isError: event.isError, text });
    });
  };
}

test("V4: tool_result does not see a schema failure; tool_execution_end does", async () => {
  const seen: Seen = { executionEnds: [], toolResults: [] };
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: countTool(seen), rt });
  open.faux.setResponses([
    fauxAssistantMessage(
      [fauxToolCall("count", { n: 2 }), fauxToolCall("count", { n: "many" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("done"),
  ]);
  await open.session.prompt("count");
  expect(seen.toolResults).toEqual(["count"]);
  const failed = seen.executionEnds.filter((end) => end.isError);
  expect(failed.length).toBe(1);
  expect(failed[0]?.text).toContain('Validation failed for tool \\"count\\"');
});
