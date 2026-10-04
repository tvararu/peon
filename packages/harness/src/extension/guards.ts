import type {
  ExtensionAPI,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";

export function installGuards(pi: ExtensionAPI): void {
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

const BASH_OFF = "Shell commands are off in the harness.";
