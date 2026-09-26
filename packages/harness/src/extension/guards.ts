import type {
  ExtensionAPI,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

const BASH_OFF = "Shell commands are off in the harness.";

export function installGuards(pi: ExtensionAPI, _rt: HarnessRuntime): void {
  pi.on(
    "user_bash",
    (): UserBashEventResult => ({
      result: {
        cancelled: false,
        exitCode: 1,
        output: BASH_OFF,
        truncated: false,
      },
    }),
  );
}
