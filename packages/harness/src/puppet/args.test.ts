import { describe, expect, test } from "bun:test";
import { GameOpcode } from "@peon/core/test-support/internals";
import { UsageError } from "#harness/config/flags";
import { type PuppetCommand, parsePuppetArgs } from "#harness/puppet/args";

describe("parsePuppetArgs", () => {
  test.each<[string[], PuppetCommand]>([
    [["start", "--json"], { kind: "start", packetTrace: "off" }],
    [
      ["start", "--json", "--packet-trace", "headers"],
      { kind: "start", packetTrace: "headers" },
    ],
    [
      ["raw", "CMSG_PING", "0100000000000000"],
      { body: "0100000000000000", kind: "raw", opcode: GameOpcode.CMSG_PING },
    ],
    [
      ["raw", "0x1DC", "ABcd"],
      { body: "abcd", kind: "raw", opcode: GameOpcode.CMSG_PING },
    ],
    [
      ["raw", "MSG_RAID_READY_CHECK"],
      { body: "", kind: "raw", opcode: GameOpcode.MSG_RAID_READY_CHECK },
    ],
    [["read", "--json"], { kind: "read" }],
    [["nearby", "--json"], { kind: "nearby" }],
    [["events", "--json"], { kind: "events" }],
    [["stop"], { kind: "stop" }],
    [
      ["call", "invite", '["Fabc"]'],
      { args: ["Fabc"], kind: "call", method: "invite" },
    ],
    [["call", "leaveGroup"], { args: [], kind: "call", method: "leaveGroup" }],
  ])("%p", (argv, command) => {
    expect(parsePuppetArgs(argv)).toEqual(command);
  });

  test("send -w joins the rest of the words into the whisper", () => {
    expect(
      parsePuppetArgs(["send", "-w", "Fevala", "hey,", "what level are you?"]),
    ).toEqual({
      kind: "send",
      target: "Fevala",
      text: "hey, what level are you?",
    });
  });

  test.each([
    [[]],
    [["status"]],
    [["start"]],
    [["start", "--json", "--packet-trace", "loud"]],
    [["start", "--json", "--packet-trace"]],
    [["start", "--packet-trace", "headers"]],
    [["raw"]],
    [["raw", "SMSG_PONG"]],
    [["raw", "CMSG_PING", "0"]],
    [["raw", "CMSG_PING", "zz"]],
    [["raw", "CMSG_NOT_AN_OPCODE"]],
    [["raw", "0x10000"]],
    [["raw", "CMSG_PING", "00", "00"]],
    [["read"]],
    [["read", "--json", "--wait", "5"]],
    [["nearby", "--json", "all"]],
    [["events"]],
    [["events", "--json", "all"]],
    [["stop", "--json"]],
    [["send", "hello"]],
    [["send", "-w", "Fevala"]],
    [["send", "-w", "", "hi"]],
    [["send", "-y", "hi"]],
    [["call"]],
    [["call", "walk"]],
    [["call", "invite", "Fabc"]],
    [["call", "invite", '["Fabc"]', "extra"]],
  ])("refuses %p", (argv) => {
    expect(() => parsePuppetArgs(argv)).toThrow(UsageError);
  });
});
