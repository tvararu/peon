import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { fauxAssistantMessage, Type } from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { createPiRuntime, splitModel } from "#harness/runtime/pi-runtime";
import {
  createFauxSession,
  emptyCredentials,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

const probeTool: ExtensionFactory = (pi) => {
  pi.registerTool({
    description: "probe",
    execute: async () => ({
      content: [{ text: "ok", type: "text" }],
      details: {},
    }),
    label: "probe",
    name: "probe",
    parameters: Type.Object({}),
  });
};

describe("splitModel", () => {
  test("splits provider and id at the first slash", () => {
    expect(splitModel("openai-codex/gpt-6-luna")).toEqual({
      id: "gpt-6-luna",
      provider: "openai-codex",
    });
  });

  test("refuses a model without a provider", () => {
    expect(() => splitModel("gpt-6-luna")).toThrow(
      '--model must be <provider>/<id>, not "gpt-6-luna".',
    );
  });
});

describe("createPiRuntime", () => {
  test("has only extension tools, the flag model and the flag thinking level", async () => {
    const { rt } = await createTestRuntime({
      flags: { model: FAUX_MODEL, thinking: "low" },
    });
    open = await createFauxSession({ extension: probeTool, rt });
    expect(open.session.getActiveToolNames()).toEqual(["probe"]);
    expect(`${open.session.model?.provider}/${open.session.model?.id}`).toBe(
      FAUX_MODEL,
    );
    expect(open.session.thinkingLevel).toBe("low");
  });

  test("writes the session file into the run dir's pi-sessions and uses workspace as cwd", async () => {
    const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
    open = await createFauxSession({ extension: probeTool, rt });
    open.faux.setResponses([fauxAssistantMessage("hello")]);
    await open.session.prompt("hi");
    expect(open.runtime.cwd).toBe(rt.paths.workspace);
    expect(
      readdirSync(rt.paths.piSessions).some((name) => name.endsWith(".jsonl")),
    ).toBe(true);
  });

  test("a new session reruns the extension factory and keeps the game handle", async () => {
    const { rt, handle } = await createTestRuntime({
      flags: { model: FAUX_MODEL },
    });
    let factoryRuns = 0;
    open = await createFauxSession({
      extension: () => {
        factoryRuns += 1;
      },
      rt,
    });
    await open.runtime.newSession();
    expect(factoryRuns).toBe(2);
    expect(rt.handle()).toBe(handle);
  });

  test("refuses a model that is not in the catalog", async () => {
    const { rt } = await createTestRuntime({
      flags: { model: "faux/missing" },
    });
    await expect(
      createPiRuntime({
        agentDir: rt.paths.dir,
        credentials: emptyCredentials,
        extension: probeTool,
        runtime: rt,
      }),
    ).rejects.toThrow("The model faux/missing is not in the Pi catalog.");
    expect(existsSync(rt.paths.workspace)).toBe(true);
  });
});
