import { opcodeName, opcodeNumber } from "@peon/core/session";
import { UsageError } from "#harness/config/flags";
import type { PacketTraceMode } from "#harness/contract/config";
import { decodeCall } from "#harness/puppet/calls";
import { HEX_BODY } from "#harness/puppet/protocol";

export type PuppetCommand =
  | { kind: "start"; packetTrace: PacketTraceMode }
  | { kind: "send"; target: string; text: string }
  | { kind: "read" }
  | { kind: "nearby" }
  | { kind: "events" }
  | { kind: "call"; method: string; args: unknown[] }
  | { kind: "raw"; opcode: number; body: string }
  | { kind: "stop" };

export const TRACE_MODES: readonly PacketTraceMode[] = [
  "off",
  "headers",
  "bodies",
];
const CLIENT_OPCODE = /^(?:CMSG|MSG)_/;
const HEX_NAME = /^0x/i;

export const USAGE = `Usage: bun packages/harness/src/puppet/main.ts <command>

  start --json [--packet-trace off|headers|bodies]
                          log the account's character in and keep it in the
                          world; a trace writes packets.jsonl to the state dir
  send -w <name> <text>   whisper <text> to <name>
  read --json             print the chat events since the last read
  nearby --json           print the units and objects around the character
  events --json           print the group, guild, duel, notice, packet error
                          and area events since the last events
  call <method> [json-array]  call an allowed handle method with those arguments
  raw <OPCODE> [hex]      send a CMSG_ or MSG_ opcode, or 0x hex, with that body;
                          needs a --packet-trace puppet
  stop                    log the character out and end the puppet`;

const EXACT: Record<string, { args: string; command: PuppetCommand }> = {
  events: { args: "--json", command: { kind: "events" } },
  nearby: { args: "--json", command: { kind: "nearby" } },
  read: { args: "--json", command: { kind: "read" } },
  stop: { args: "", command: { kind: "stop" } },
};

export function parsePuppetArgs(argv: readonly string[]): PuppetCommand {
  const [verb = "", ...rest] = argv;
  if (verb === "send") return parseSend(rest);
  if (verb === "call") return parseCall(rest);
  if (verb === "start") return parseStart(rest);
  if (verb === "raw") return parseRaw(rest);
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

function parseCall(rest: readonly string[]): PuppetCommand {
  const [method = "", json, ...extra] = rest;
  if (method === "" || extra.length > 0)
    throw new UsageError("call takes <method> [json-array].");
  const call = decodeCall(method, json);
  if ("error" in call) throw new UsageError(call.error);
  return {
    args: json === undefined ? [] : (JSON.parse(json) as unknown[]),
    kind: "call",
    method,
  };
}

function parseStart(rest: readonly string[]): PuppetCommand {
  const [json, flag, mode, ...extra] = rest;
  const packetTrace =
    flag === undefined
      ? "off"
      : TRACE_MODES.find(
          (known) => flag === "--packet-trace" && known === mode,
        );
  if (json !== "--json" || packetTrace === undefined || extra.length > 0)
    throw new UsageError(
      "start takes --json [--packet-trace off|headers|bodies].",
    );
  return { kind: "start", packetTrace };
}

function parseRaw(rest: readonly string[]): PuppetCommand {
  const [name = "", body = "", ...extra] = rest;
  const opcode = opcodeNumber(name);
  if (opcode === undefined || extra.length > 0)
    throw new UsageError("raw takes <OPCODE> [hex].");
  if (!(HEX_NAME.test(name) || CLIENT_OPCODE.test(opcodeName(opcode))))
    throw new UsageError(`raw sends only CMSG_ and MSG_ opcodes, not ${name}.`);
  if (!HEX_BODY.test(body))
    throw new UsageError("raw takes the body as an even number of hex digits.");
  return { body: body.toLowerCase(), kind: "raw", opcode };
}
