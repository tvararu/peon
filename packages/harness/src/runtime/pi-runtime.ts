import { mkdir } from "node:fs/promises";
import type { Provider } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionFactory,
  type ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { lunaPrompt } from "#harness/prompt/install";
import { seedManagedTools } from "#harness/runtime/managed-tools";

export type PiRuntimeInit = {
  runtime: HarnessRuntime;
  models: ModelRuntime;
  model: string;
  agentDir: string;
  extensions: readonly InlineExtension[];
  extensionPaths?: readonly string[];
  providers?: readonly Provider[];
};

export type InlineExtension = { name: string; factory: ExtensionFactory };

export type ModelRef = { provider: string; id: string };

const LOADER = {
  noContextFiles: true,
  noExtensions: true,
  noPromptTemplates: true,
  noSkills: true,
} as const;

export function splitModel(ref: string): ModelRef {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1)
    throw new Error(`--model must be <provider>/<id>, not "${ref}".`);
  return { id: ref.slice(slash + 1), provider: ref.slice(0, slash) };
}

export async function createPiRuntime(
  init: PiRuntimeInit,
): Promise<AgentSessionRuntime> {
  const { workspace, piSessions } = init.runtime.paths;
  await mkdir(workspace, { recursive: true });
  await mkdir(piSessions, { recursive: true });
  await seedManagedTools(init.agentDir);
  for (const provider of init.providers ?? [])
    init.models.registerNativeProvider(provider);
  const sessionManager = SessionManager.create(workspace, piSessions);
  return createAgentSessionRuntime(sessionFactory(init), {
    agentDir: init.agentDir,
    cwd: workspace,
    sessionManager,
  });
}

function sessionFactory(init: PiRuntimeInit): CreateAgentSessionRuntimeFactory {
  const ref = splitModel(init.model);
  return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    const model = init.models.getModel(ref.provider, ref.id);
    if (!model)
      throw new Error(`The model ${init.model} is not in the Pi catalog.`);
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      quietStartup: true,
    });
    const resourceLoaderOptions = {
      ...LOADER,
      additionalExtensionPaths: [...(init.extensionPaths ?? [])],
      extensionFactories: [...init.extensions],
      systemPromptOverride: () => lunaPrompt(init.runtime),
    };
    const services = await createAgentSessionServices({
      agentDir,
      cwd,
      modelRuntime: init.models,
      resourceLoaderOptions,
      settingsManager,
    });
    const created = await createAgentSessionFromServices({
      model,
      noTools: "builtin",
      services,
      sessionManager,
      sessionStartEvent,
      thinkingLevel: init.runtime.flags.thinking,
    });
    return { ...created, diagnostics: services.diagnostics, services };
  };
}
