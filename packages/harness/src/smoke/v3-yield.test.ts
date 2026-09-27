import { afterEach, expect, test } from "bun:test";
import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { RunEnd } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";
import { wowExtension } from "#harness/extension/extension";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
  withExtensions,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let current: FauxSession | undefined;

afterEach(async () => {
  await current?.dispose();
  current = undefined;
});

type Probe = {
  order: string[];
  started: PromiseWithResolvers<void>;
  signals: AbortSignal[];
};

function holdRunTool(rt: HarnessRuntime, probe: Probe): ExtensionFactory {
  return (pi) => {
    pi.registerTool({
      description:
        "Start a run and wait for it, or yield when the human writes.",
      execute: async (toolCallId, _params, signal) => {
        if (signal) probe.signals.push(signal);
        signal?.addEventListener("abort", () => rt.stopAll("esc"), {
          once: true,
        });
        const run = rt.runs.start({
          args: {},
          kind: "engage",
          launch: ({ signal: runSignal }) =>
            new Promise<RunEnd<undefined>>((resolve) =>
              runSignal.addEventListener("abort", () =>
                resolve({
                  status: "cancelled",
                  summary: "stopped",
                  value: undefined,
                }),
              ),
            ),
          toolCallId,
        });
        probe.order.push("tool:start");
        probe.started.resolve();
        const why = await Promise.race([
          rt.yields.wait(),
          run.done.then(() => "ended" as const),
        ]);
        rt.runs.release(run.id);
        probe.order.push(`tool:${why}`);
        return {
          content: [
            {
              text: `RUNNING ${run.id}: the human wrote a message. Read it before you act.`,
              type: "text",
            },
          ],
          details: {},
        };
      },
      label: "hold run",
      name: "hold_run",
      parameters: Type.Object({}),
    });
  };
}

function textsAfterLastToolResult(
  messages: readonly { role: string; content: unknown }[],
): string[] {
  const last = messages.findLastIndex(
    (message) => message.role === "toolResult",
  );
  return messages
    .slice(last + 1)
    .flatMap((message) =>
      message.role === "user" && Array.isArray(message.content)
        ? message.content.flatMap((part: { type: string; text?: string }) =>
            part.type === "text" && part.text ? [part.text] : [],
          )
        : [],
    );
}

async function setup() {
  const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
  const probe: Probe = {
    order: [],
    signals: [],
    started: Promise.withResolvers<void>(),
  };
  const open = await createFauxSession({
    extension: withExtensions(wowExtension(rt), holdRunTool(rt, probe)),
    rt,
  });
  current = open;
  return { open, probe, rt };
}

test("V3: a steer typed while a run tool blocks yields after Pi queued it, and the model sees it next", async () => {
  const { open, probe, rt } = await setup();
  let seen: string[] = [];
  const answer: FauxResponseFactory = (context) => {
    seen = textsAfterLastToolResult(context.messages);
    return fauxAssistantMessage("I am at the camp. The fight goes on.");
  };
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    answer,
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.prompt("where are you?", { streamingBehavior: "steer" });
  probe.order.push("steer:queued");
  await turn;
  expect(probe.order).toEqual(["tool:start", "steer:queued", "tool:human"]);
  expect(seen).toEqual(["where are you?"]);
  expect(rt.runs.get("r1")).toMatchObject({
    awaited: false,
    status: "running",
  });
  expect(
    rt.log
      .since(0)
      .filter((row) => row.event === "human/input")
      .map((row) => row.data),
  ).toEqual([
    expect.objectContaining({ stopReflex: false, text: "kill three stalkers" }),
    expect.objectContaining({ stopReflex: false, text: "where are you?" }),
  ]);
});

test("V3: a stop steer cancels the run through the reflex before the model runs", async () => {
  const { open, probe, rt } = await setup();
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("Stopped."),
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.prompt("Stop! Stop right now.", {
    streamingBehavior: "steer",
  });
  expect(rt.runs.get("r1")).toMatchObject({
    reason: "human_stop",
    status: "cancelled",
  });
  await turn;
  expect(probe.order.at(-1)).toMatch(/^tool:(ended|human)$/);
});

test("Esc: aborting the turn aborts the tool's signal, and stopAll(esc) ends the run", async () => {
  const { open, probe, rt } = await setup();
  open.faux.setResponses([
    fauxAssistantMessage(fauxToolCall("hold_run", {}), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("unused"),
  ]);
  const turn = open.session.prompt("kill three stalkers");
  await probe.started.promise;
  await open.session.abort();
  await turn;
  expect(probe.signals[0]?.aborted).toBe(true);
  expect(rt.runs.get("r1")).toMatchObject({
    reason: "esc",
    status: "cancelled",
  });
  expect(probe.order.at(-1)).toBe("tool:ended");
});
