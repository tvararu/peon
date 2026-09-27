import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";
import { installGuards } from "#harness/extension/guards";
import { installInput } from "#harness/extension/input";
import { installTools } from "#harness/tools/install";

export function wowExtension(rt: HarnessRuntime): ExtensionFactory {
  return (pi) => {
    installInput(pi, rt);
    installGuards(pi, rt);
    installTools(pi, rt);
    installShutdown(pi, rt);
  };
}

export function installShutdown(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.on("session_shutdown", async ({ reason }) => {
    rt.router.setSink(undefined);
    if (reason === "quit") await rt.shutdown();
  });
}
