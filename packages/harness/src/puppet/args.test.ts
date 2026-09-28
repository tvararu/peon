import { describe, expect, test } from "bun:test";
import { UsageError } from "#harness/config/flags";
import { type PuppetCommand, parsePuppetArgs } from "#harness/puppet/args";

describe("parsePuppetArgs", () => {
  test.each<[string[], PuppetCommand]>([
    [["start", "--json"], { kind: "start" }],
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
