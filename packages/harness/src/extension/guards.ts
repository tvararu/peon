import type {
  ExtensionAPI,
  ExtensionContext,
  UserBashEventResult,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "#harness/contract/services";

export const LOGIN_NOTE =
  "/login and /logout do nothing useful here. The harness reads the Codex login from omp.";

const BASH_OFF = "Shell commands are off in the harness.";
const ENTER_KEYS: readonly string[] = ["\r", "\n", "\u001b[13u"];
const LOGIN_COMMANDS: readonly string[] = ["/login", "/logout"];

export function installGuards(pi: ExtensionAPI, rt: HarnessRuntime): void {
  let offInput: (() => void) | undefined;
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
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    offInput = ctx.ui.onTerminalInput((data) => guardLogin(rt, ctx, data));
  });
  pi.on("session_shutdown", () => {
    offInput?.();
    offInput = undefined;
  });
}

function guardLogin(
  rt: HarnessRuntime,
  ctx: ExtensionContext,
  data: string,
): { consume: boolean } | undefined {
  if (!ENTER_KEYS.includes(data)) return undefined;
  const text = ctx.ui.getEditorText().trim();
  if (
    !LOGIN_COMMANDS.some(
      (command) => text === command || text.startsWith(`${command} `),
    )
  )
    return undefined;
  ctx.ui.setEditorText("");
  ctx.ui.notify(LOGIN_NOTE, "warning");
  rt.log.append({
    class: "log",
    data: { text },
    domain: "human",
    event: "human/input",
    text: `Human: ${text} (blocked)`,
  });
  return { consume: true };
}
