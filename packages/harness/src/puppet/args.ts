import { UsageError } from "#harness/config/flags";

export type PuppetCommand =
  | { kind: "start" }
  | { kind: "send"; target: string; text: string }
  | { kind: "read" }
  | { kind: "nearby" }
  | { kind: "stop" };

export const USAGE = `Usage: bun packages/harness/src/puppet/main.ts <command>

  start --json            log the account's character in and keep it in the world
  send -w <name> <text>   whisper <text> to <name>
  read --json             print the chat events since the last read
  nearby --json           print the units and objects around the character
  stop                    log the character out and end the puppet`;

const EXACT: Record<string, { args: string; command: PuppetCommand }> = {
  nearby: { args: "--json", command: { kind: "nearby" } },
  read: { args: "--json", command: { kind: "read" } },
  start: { args: "--json", command: { kind: "start" } },
  stop: { args: "", command: { kind: "stop" } },
};

export function parsePuppetArgs(argv: readonly string[]): PuppetCommand {
  const [verb = "", ...rest] = argv;
  if (verb === "send") return parseSend(rest);
  const exact = EXACT[verb];
  if (exact === undefined)
    throw new UsageError(
      verb === "" ? "No command given." : `Unknown command: ${verb}`,
    );
  if (rest.join(" ") !== exact.args)
    throw new UsageError(
      `${verb} takes ${exact.args === "" ? "no arguments" : exact.args}.`,
    );
  return exact.command;
}

function parseSend(rest: readonly string[]): PuppetCommand {
  const [flag, target = "", ...words] = rest;
  const text = words.join(" ");
  if (flag !== "-w" || target === "" || text === "")
    throw new UsageError("send takes -w <name> <text>.");
  return { kind: "send", target, text };
}
