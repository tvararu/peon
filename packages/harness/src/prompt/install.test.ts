import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  fauxAssistantMessage,
  fauxProvider,
  getCurrentSystemPrompt,
  InMemoryCredentialStore,
  type TranscriptMessages,
  Type,
} from "@earendil-works/pi-ai";
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionAPI,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { HarnessRuntime, ReadyGate } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { installPrompt } from "#harness/prompt/install";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Handler = (event: unknown, ctx: unknown) => unknown;

const WORLD: InWorld = {
  account: "FAC66F5A1B200",
  at: 0,
  capabilities: { factions: true, jev: false, navigation: true, spells: true },
  char: "Fgklibhlflc",
  className: "Priest",
  guid: "1a2b",
  level: 10,
  mapId: 530,
  pose: { mapId: 530, x: 8735, y: -6685, z: 20 },
  race: "Blood Elf",
  zone: "Eversong Woods",
  zoneId: 3430,
};
const FIRST =
  "You play World of Warcraft 3.3.5a as Fgklibhlflc, a level 10 Blood Elf Priest. A human";

function readyWith(world: InWorld | undefined): ReadyGate {
  const ready = world !== undefined;
  return {
    attach: () => () => {},
    inWorld: () => world,
    isReady: () => ready,
    onReady: () => () => {},
    whenReady: async () => ready,
  };
}

async function installed(world: InWorld | undefined): Promise<{
  rt: HarnessRuntime;
  fire: (name: string, event: unknown) => Promise<unknown>;
}> {
  const { rt } = await createTestRuntime({
    parts: { ready: readyWith(world) },
  });
  const handlers = new Map<string, Handler>();
  const on = (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {};
  };
  installPrompt({ on } as unknown as ExtensionAPI, rt);
  const fire = async (name: string, event: unknown) =>
    handlers.get(name)?.(event, {});
  return { fire, rt };
}

async function systemPrompt(world: InWorld | undefined): Promise<string> {
  const { fire } = await installed(world);
  const result = (await fire("before_agent_start", {
    prompt: "hi",
    type: "before_agent_start",
  })) as { systemPrompt: string };
  return result.systemPrompt;
}

describe("installPrompt", () => {
  test("before_agent_start gives the filled prompt and the tool notes", async () => {
    const prompt = await systemPrompt(WORLD);
    expect(prompt).toStartWith(FIRST);
    expect(prompt).toContain(
      "\n\nTool notes:\n- look: Use find to filter. The Nearest line includes units out of view.\n",
    );
    expect(prompt).toContain(
      "- journal: log is history. It never loses events when you read it.",
    );
    expect(
      prompt.split("\n").filter((line) => line.startsWith("- stop: ")),
    ).toHaveLength(1);
  });

  test("before ready it names the profile character only", async () => {
    const { rt, fire } = await installed(undefined);
    const result = (await fire("before_agent_start", {
      prompt: "hi",
      type: "before_agent_start",
    })) as { systemPrompt: string };
    expect(result.systemPrompt).toStartWith(
      `You play World of Warcraft 3.3.5a as ${rt.profile.character}. A human`,
    );
  });

  test("drops unknown race, class and level", async () => {
    expect(
      await systemPrompt({
        ...WORLD,
        className: "unknown",
        level: 0,
        race: "unknown",
      }),
    ).toStartWith("You play World of Warcraft 3.3.5a as Fgklibhlflc. A human");
    expect(await systemPrompt({ ...WORLD, race: "unknown" })).toStartWith(
      "You play World of Warcraft 3.3.5a as Fgklibhlflc, a level 10 Priest. A human",
    );
  });

  test("never holds the password or the account name", async () => {
    const { rt, fire } = await installed(WORLD);
    const result = (await fire("before_agent_start", {
      prompt: "hi",
      type: "before_agent_start",
    })) as { systemPrompt: string };
    expect(result.systemPrompt).not.toContain(rt.profile.client.password);
    expect(result.systemPrompt).not.toContain(rt.profile.account);
    expect(result.systemPrompt).not.toContain(WORLD.account);
  });

  test("context_with_system puts the prompt first and keeps the tools", async () => {
    const { fire } = await installed(WORLD);
    const tool = {
      description: "Look.",
      name: "look",
      parameters: Type.Object({}),
    };
    const user: AgentMessage = {
      content: [{ text: "hi", type: "text" }],
      role: "user",
      timestamp: 2,
    };
    const messages: AgentMessage[] = [
      {
        content: "You are an expert coding assistant.",
        role: "system",
        timestamp: 1,
        toolsAdded: [tool],
      },
      user,
      {
        content: "",
        role: "system",
        sections: { rules: "- Be concise" },
        timestamp: 3,
      },
    ];
    const result = (await fire("context_with_system", {
      messages,
      type: "context_with_system",
    })) as { messages: AgentMessage[] };
    const [head, ...rest] = result.messages;
    expect(head?.role).toBe("system");
    expect(getCurrentSystemPrompt(result.messages)).toStartWith(FIRST);
    expect(getCurrentSystemPrompt(result.messages)).not.toContain(
      "coding assistant",
    );
    expect(
      head?.role === "system" ? head.toolsAdded?.map((t) => t.name) : undefined,
    ).toEqual(["look"]);
    expect(rest).toEqual([user]);
  });

  test("a wake turn gets the Luna prompt too", async () => {
    const dir = scratchDir("harness-prompt");
    const { rt } = await createTestRuntime({
      parts: { ready: readyWith(WORLD) },
    });
    const faux = fauxProvider({
      models: [{ id: "m1" }],
      provider: "faux-prompt",
    });
    const seen: string[] = [];
    const reply = (context: { messages: TranscriptMessages }) => {
      seen.push(getCurrentSystemPrompt(context.messages));
      return fauxAssistantMessage("ok");
    };
    faux.setResponses([reply, reply]);
    const factory: CreateAgentSessionRuntimeFactory = async ({
      cwd,
      agentDir,
      sessionManager,
      sessionStartEvent,
    }) => {
      const modelRuntime = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        refreshOnCreate: false,
      });
      modelRuntime.registerNativeProvider(faux.provider);
      const settingsManager = SettingsManager.inMemory({
        compaction: { enabled: false },
        quietStartup: true,
      });
      const extensionFactories = [
        {
          factory: (pi: ExtensionAPI) => installPrompt(pi, rt),
          name: "prompt",
        },
      ];
      const resourceLoaderOptions = {
        extensionFactories,
        noContextFiles: true,
        noExtensions: true,
        noPromptTemplates: true,
        noSkills: true,
        noThemes: true,
      };
      const services = await createAgentSessionServices({
        agentDir,
        cwd,
        modelRuntime,
        resourceLoaderOptions,
        settingsManager,
      });
      const created = await createAgentSessionFromServices({
        model: faux.getModel(),
        noTools: "builtin",
        services,
        sessionManager,
        sessionStartEvent,
        thinkingLevel: "off",
      });
      return { ...created, diagnostics: services.diagnostics, services };
    };
    const runtime = await createAgentSessionRuntime(factory, {
      agentDir: join(dir, "agent"),
      cwd: dir,
      sessionManager: SessionManager.inMemory(dir),
    });
    try {
      await runtime.session.prompt("hello");
      await runtime.session.sendCustomMessage(
        {
          content: "[game 0s] Kaelyn whispers: hi",
          customType: "wow-event",
          display: true,
        },
        { triggerTurn: true },
      );
    } finally {
      await runtime.dispose();
      await rm(dir, { force: true, recursive: true });
    }
    expect(seen).toHaveLength(2);
    for (const prompt of seen) expect(prompt).toStartWith(FIRST);
  });
});
