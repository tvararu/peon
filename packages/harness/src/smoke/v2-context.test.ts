import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
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

const MARK = "CONTEXT-ONLY-NOW-LINE";

const perCallNow: ExtensionFactory = (pi) => {
  pi.on("context", (event) => ({
    messages: [
      ...event.messages,
      {
        content: [{ text: MARK, type: "text" }],
        role: "user",
        timestamp: Date.now(),
      },
    ],
  }));
};

test("V2: a context-hook message reaches the model but is not stored in the session file", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  open = await createFauxSession({ extension: perCallNow, rt });
  let sent = "";
  const answer: FauxResponseFactory = (context) => {
    sent = JSON.stringify(context.messages);
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  await open.session.prompt("hello");
  expect(sent).toContain(MARK);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).not.toContain(MARK);
});

const WAKE_MARK = "CONTEXT-HIDDEN-WAKE-NOW";

function wakeNow(ended: () => void): {
  extension: ExtensionFactory;
  api: () => ExtensionAPI | undefined;
} {
  let saved: ExtensionAPI | undefined;
  const extension: ExtensionFactory = (pi) => {
    saved = pi;
    pi.on("agent_end", () => ended());
    pi.on("context", (event) => {
      const last = event.messages.at(-1) as { customType?: string } | undefined;
      if (last?.customType !== "wow-event") return;
      return {
        messages: [
          ...event.messages,
          {
            content: WAKE_MARK,
            customType: "wow-now",
            display: false,
            role: "custom",
            timestamp: Date.now(),
          },
        ],
      };
    });
  };
  return { api: () => saved, extension };
}

test("V2: a hidden custom message added in context on a wake run reaches the model and is not stored", async () => {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  const done = Promise.withResolvers<void>();
  const wake = wakeNow(() => done.resolve());
  open = await createFauxSession({ extension: wake.extension, rt });
  let sent = "";
  const answer: FauxResponseFactory = (context) => {
    sent = JSON.stringify(context.messages);
    return fauxAssistantMessage("ok");
  };
  open.faux.setResponses([answer]);
  wake.api()?.sendMessage(
    {
      content: "[game 0s] r4 travel ended.",
      customType: "wow-event",
      details: { entries: [], kind: "wake" },
      display: true,
    },
    { triggerTurn: true },
  );
  await done.promise;
  expect(sent).toContain(WAKE_MARK);
  const file = open.session.sessionManager.getSessionFile() ?? "";
  expect(readFileSync(file, "utf8")).not.toContain(WAKE_MARK);
});
