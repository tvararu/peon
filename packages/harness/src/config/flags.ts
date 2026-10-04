import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { messageOf } from "@peon/core/lib/errors";
import type { HarnessFlags, PacketTraceMode } from "#harness/contract/config";

export class UsageError extends Error {}

export const USAGE = `Usage: mise harness [--profile <path>] [options]

  --profile <path>        soap session JSON, soap ledger JSON or Peon config.toml (default: ~/.config/peon/config.toml)
  --run-dir <path>        run directory (default: <state>/runs/<utc>-<character>)
  --model <provider/id>   model (default: follows the login; see docs/harness.md)
  --thinking <level>      off|minimal|low|medium|high|xhigh|max (default: off)
  --no-connect            do not log in at start; use /connect
  --wake on|off           let game events start a turn (default: on)
  --glyphs <name>         nerd|unicode|ascii (default: nerd, or PEON_GLYPHS)
  --stop-reflex on|off    stop all actions when a short message starts with "stop" (default: on)
  --now-per-call          send the [now] line before every model request
  --log-entities          write raw entity rows to the game log
  --packet-trace <mode>   off|headers|bodies: write packets.jsonl (default: off)
  --extension <path>      load a Pi extension file; repeat for more (after the profile's extensions)
  --check                 check the profile, the lock and the model login, then exit`;

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
  extension: { multiple: true, type: "string" },
  glyphs: { type: "string" },
  "log-entities": { type: "boolean" },
  model: { type: "string" },
  "no-connect": { type: "boolean" },
  "now-per-call": { type: "boolean" },
  "packet-trace": { type: "string" },
  profile: { type: "string" },
  "run-dir": { type: "string" },
  "stop-reflex": { type: "string" },
  thinking: { type: "string" },
  wake: { type: "string" },
} as const;

export function defaultProfilePath(home = homedir()): string {
  return `${home}/.config/peon/config.toml`;
}

export function harnessStateDir(home: string): string {
  return `${home}/.local/state/peon-harness`;
}

export function parseFlags(
  argv: readonly string[],
  home = homedir(),
): HarnessFlags {
  const values = readArgs(argv);
  const profile = values.profile ?? defaultProfilePath(home);
  return {
    check: values.check ?? false,
    connect: !values["no-connect"],
    extensions: (values.extension ?? []).map((path) => resolve(path)),
    glyphs: values.glyphs,
    logEntities: values["log-entities"] ?? false,
    model: values.model,
    nowPerCall: values["now-per-call"] ?? false,
    packetTrace: traceMode(values["packet-trace"]),
    profile,
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
  if (value === undefined) return "off";
  const level = THINKING.find((known) => known === value);
  if (!level)
    throw new UsageError(
      `--thinking must be one of ${THINKING.join("|")}, not "${value}".`,
    );
  return level;
}

const TRACE_MODES: readonly PacketTraceMode[] = ["off", "headers", "bodies"];

function traceMode(value: string | undefined): PacketTraceMode {
  if (value === undefined) return "off";
  const mode = TRACE_MODES.find((known) => known === value);
  if (!mode)
    throw new UsageError(
      `--packet-trace must be off, headers or bodies, not "${value}".`,
    );
  return mode;
}

function onOff(flag: string, value: string | undefined): boolean {
  if (value === undefined || value === "on") return true;
  if (value === "off") return false;
  throw new UsageError(`${flag} must be on or off, not "${value}".`);
}
