import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { messageOf } from "@peon/core/lib/errors";
import type { HarnessFlags } from "#harness/contract/config";

export class UsageError extends Error {}

export const DEFAULT_MODEL = "openai-codex/gpt-6-luna";

export const USAGE = `Usage: mise harness --profile <path> [options]

  --profile <path>        soap session JSON, soap ledger JSON or Peon config.toml (required)
  --run-dir <path>        run directory (default: <state>/runs/<utc>-<character>)
  --model <provider/id>   model (default: ${DEFAULT_MODEL})
  --thinking <level>      off|minimal|low|medium|high|xhigh|max (default: high)
  --no-connect            do not log in at start; use /connect
  --wake on|off           let game events start a turn (default: on)
  --glyphs <name>         nerd|unicode|ascii (default: nerd, or PEON_GLYPHS)
  --stop-reflex on|off    stop all actions when a short message starts with "stop" (default: on)
  --now-per-call          send the [now] line before every model request
  --log-entities          write raw entity rows to the game log
  --check                 check the profile, the lock and the Codex login, then exit`;

const THINKING: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const OPTIONS = {
  check: { type: "boolean" },
  glyphs: { type: "string" },
  "log-entities": { type: "boolean" },
  model: { type: "string" },
  "no-connect": { type: "boolean" },
  "now-per-call": { type: "boolean" },
  profile: { type: "string" },
  "run-dir": { type: "string" },
  "stop-reflex": { type: "string" },
  thinking: { type: "string" },
  wake: { type: "string" },
} as const;

export function harnessStateDir(home: string): string {
  return `${home}/.local/state/peon-harness`;
}

export function parseFlags(argv: readonly string[]): HarnessFlags {
  const values = readArgs(argv);
  if (!values.profile) throw new UsageError("--profile <path> is required.");
  return {
    check: values.check ?? false,
    connect: !values["no-connect"],
    glyphs: values.glyphs,
    logEntities: values["log-entities"] ?? false,
    model: values.model ?? DEFAULT_MODEL,
    nowPerCall: values["now-per-call"] ?? false,
    profile: values.profile,
    runDir: values["run-dir"],
    stopReflex: onOff("--stop-reflex", values["stop-reflex"]),
    thinking: thinkingOf(values.thinking),
    wake: onOff("--wake", values.wake),
  };
}

function readArgs(argv: readonly string[]) {
  try {
    return parseArgs({
      allowPositionals: false,
      args: [...argv],
      options: OPTIONS,
      strict: true,
    }).values;
  } catch (error) {
    throw new UsageError(messageOf(error), { cause: error });
  }
}

function thinkingOf(value: string | undefined): ThinkingLevel {
  if (value === undefined) return "high";
  const level = THINKING.find((known) => known === value);
  if (!level)
    throw new UsageError(
      `--thinking must be one of ${THINKING.join("|")}, not "${value}".`,
    );
  return level;
}

function onOff(flag: string, value: string | undefined): boolean {
  if (value === undefined || value === "on") return true;
  if (value === "off") return false;
  throw new UsageError(`${flag} must be on or off, not "${value}".`);
}
