import { mkdir } from "node:fs/promises";
import type { CredentialStore, Provider } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionFactory,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { lunaPrompt } from "#harness/prompt/install";
import { seedManagedTools } from "#harness/runtime/managed-tools";

export type PiRuntimeInit = {
  runtime: HarnessRuntime;
  credentials: CredentialStore;
  agentDir: string;
  extension: ExtensionFactory;
  providers?: readonly Provider[];
};

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
  const sessionManager = SessionManager.create(workspace, piSessions);
  return createAgentSessionRuntime(sessionFactory(init), {
    agentDir: init.agentDir,
    cwd: workspace,
    sessionManager,
  });
}

function sessionFactory(init: PiRuntimeInit): CreateAgentSessionRuntimeFactory {
  const { flags } = init.runtime;
  const ref = splitModel(flags.model);
  return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    const modelRuntime = await createModels(init);
    const model = modelRuntime.getModel(ref.provider, ref.id);
    if (!model)
      throw new Error(`The model ${flags.model} is not in the Pi catalog.`);
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      quietStartup: true,
    });
    const resourceLoaderOptions = {
      ...LOADER,
      extensionFactories: [{ factory: init.extension, name: "wow" }],
      systemPromptOverride: () => lunaPrompt(init.runtime),
    };
    const services = await createAgentSessionServices({
      agentDir,
      cwd,
      modelRuntime,
      resourceLoaderOptions,
      settingsManager,
    });
    const created = await createAgentSessionFromServices({
      model,
      noTools: "builtin",
      services,
      sessionManager,
      sessionStartEvent,
      thinkingLevel: flags.thinking,
    });
    return { ...created, diagnostics: services.diagnostics, services };
  };
}

async function createModels(init: PiRuntimeInit): Promise<ModelRuntime> {
  const models = await ModelRuntime.create({
    credentials: init.credentials,
    modelsPath: null,
    refreshOnCreate: false,
  });
  for (const provider of init.providers ?? [])
    models.registerNativeProvider(provider);
  return models;
}
