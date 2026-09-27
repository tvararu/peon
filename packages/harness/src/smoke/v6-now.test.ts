import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
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

const NOW_LINE = "[now 19:13:31] Testchar L10 Priest HP 190/217 alive";

const hiddenNow: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", () => ({
    message: { content: NOW_LINE, customType: "wow-now", display: false },
  }));
};

test("V6: a hidden before_agent_start message reaches the model as user text after the prompt", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: hiddenNow, rt });
  let texts: string[] = [];
  const answer: FauxResponseFactory = (context) => {
    texts = context.messages.flatMap((message) =>
      message.role === "user" && Array.isArray(message.content)
        ? message.content.flatMap((part) =>
            part.type === "text" ? [part.text] : [],
          )
        : [],
    );
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  await open.session.prompt("what do you see?");
  expect(texts).toEqual(["what do you see?", NOW_LINE]);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).toContain('"display":false');
});
