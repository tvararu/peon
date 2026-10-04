import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { installEvents } from "#harness/events/install";
import { installCommands } from "#harness/extension/commands";
import { installGuards } from "#harness/extension/guards";
import { installInput } from "#harness/extension/input";
import { installPrompt } from "#harness/prompt/install";
import { installTools } from "#harness/tools/install";
import { installUi } from "#harness/ui/install";

export function wowExtension(rt: HarnessRuntime): ExtensionFactory {
  return (pi) => {
    installGuards(pi);
    installInput(pi, rt);
    installTools(pi, rt);
    installEvents(pi, rt);
    installPrompt(pi, rt);
    installUi(pi, rt);
    installCommands(pi, rt);
    installShutdown(pi, rt);
  };
}

export function installShutdown(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.on("session_shutdown", async ({ reason }) => {
    rt.router.setSink(undefined);
    if (reason === "quit") await rt.shutdown();
  });
}
