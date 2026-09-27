import {
  type CredentialStore,
  type FauxProviderHandle,
  fauxProvider,
} from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionRuntime,
  ExtensionFactory,
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

export const emptyCredentials: CredentialStore = {
  delete: async () => {},
  list: async () => [],
  modify: async () => undefined,
  read: async () => undefined,
};

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
    credentials: emptyCredentials,
    extensionPaths: init.extensionPaths,
    extensions: [
      { factory: worldExtension(init.rt), name: "world" },
      { factory: init.extension, name: "wow" },
    ],
    providers: [faux.provider],
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
