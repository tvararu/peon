import { describe, expect, test } from "bun:test";
import { opcodeNumber } from "@peon/core/session";
import { parseProbeArgs } from "#tools/probe-args";

const CODE = (name: string) => opcodeNumber(name) ?? -1;

describe("parseProbeArgs", () => {
  test("reads steps in order with their bodies and flow arguments", () => {
    const argv = [
      "FAC0123456789",
      "--flow",
      "nearest",
      "--arg",
      "kind=questgiver",
      "--send",
      "CMSG_PING",
      "--body",
      "01000000",
      "--send",
      "0x1dc",
      "--flow",
      "talk",
      "--arg",
      "entry=15278",
    ];
    expect(parseProbeArgs(argv)).toEqual({
      account: "FAC0123456789",
      bodies: false,
      expect: [],
      steps: [
        { args: { kind: "questgiver" }, flow: "nearest" },
        { body: "01000000", opcode: CODE("CMSG_PING") },
        { opcode: 0x1_dc },
        { args: { entry: "15278" }, flow: "talk" },
      ],
      until: [],
      waitMs: 5000,
    });
  });

  test("reads wait, until, expect, bodies and out", () => {
    const argv = [
      "FAC0123456789",
      "--wait",
      "2.5",
      "--until",
      "SMSG_PONG",
      "--expect",
      "SMSG_PONG",
      "--expect",
      "0x1dd",
      "--bodies",
      "--out",
      "tmp/p",
    ];
    expect(parseProbeArgs(argv)).toEqual({
      account: "FAC0123456789",
      bodies: true,
      expect: [CODE("SMSG_PONG"), 0x1_dd],
      out: "tmp/p",
      steps: [],
      until: [CODE("SMSG_PONG")],
      waitMs: 2500,
    });
  });

  test.each([
    [[], "an account"],
    [["ADMIN"], "FAC"],
    [["fac0123456789"], "FAC"],
    [["FAC0123456789", "--send", "CMSG_NOPE"], "unknown opcode"],
    [["FAC0123456789", "--body", "00"], "--body follows a --send"],
    [["FAC0123456789", "--send", "CMSG_PING", "--body", "0g"], "hex"],
    [["FAC0123456789", "--arg", "kind=unit"], "--arg follows a --flow"],
    [["FAC0123456789", "--flow", "talk", "--arg", "entry"], "key=value"],
    [["FAC0123456789", "--wait", "-1"], "--wait"],
    [["FAC0123456789", "--wait"], "--wait"],
    [["FAC0123456789", "--nope"], "--nope"],
    [["FAC0123456789", "FAC0123456780"], "one account"],
  ])("refuses %j", (argv, text) => {
    const parsed = parseProbeArgs(argv);
    expect(parsed).toEqual({ usage: expect.stringContaining(text) });
  });
});
