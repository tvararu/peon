import {
  type FauxProviderHandle,
  fauxProvider,
  type Provider,
} from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type AgentSessionRuntime,
  type ExtensionFactory,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { HarnessRuntime } from "#harness/contract/services";
import { createPiRuntime } from "#harness/runtime/pi-runtime";
import { worldExtension } from "#harness/world/extension";

export const FAUX_MODEL = "faux/faux-1";

export type FauxSession = {
  runtime: AgentSessionRuntime;
  session: AgentSession;
  faux: FauxProviderHandle;
  dispose: () => Promise<void>;
};

export async function sharedModels(
  providers: readonly Provider[],
): Promise<ModelRuntime> {
  const models = await ModelRuntime.create({
    authPath: `${scratchDir("harness-auth")}/auth.json`,
    modelsPath: null,
    refreshOnCreate: false,
  });
  for (const provider of providers) models.registerNativeProvider(provider);
  return models;
}

export async function createFauxSession(init: {
  rt: HarnessRuntime;
  extension: ExtensionFactory;
  extensionPaths?: readonly string[];
}): Promise<FauxSession> {
  const faux = fauxProvider({
    models: [{ id: "faux-1", reasoning: true }],
    provider: "faux",
  });
  const agentDir = scratchDir("harness-agent");
  const runtime = await createPiRuntime({
    agentDir,
    extensionPaths: init.extensionPaths,
    extensions: [
      { factory: worldExtension(init.rt), name: "world" },
      { factory: init.extension, name: "wow" },
    ],
    model: FAUX_MODEL,
    models: await sharedModels([faux.provider]),
    runtime: init.rt,
  });
  return {
    dispose: () => runtime.dispose(),
    faux,
    runtime,
    session: runtime.session,
  };
}

export function withExtensions(
  ...factories: ExtensionFactory[]
): ExtensionFactory {
  return async (pi) => {
    for (const factory of factories) await factory(pi);
  };
}
