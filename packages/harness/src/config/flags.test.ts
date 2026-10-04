import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  defaultProfilePath,
  harnessStateDir,
  parseFlags,
  USAGE,
  UsageError,
} from "#harness/config/flags";

describe("parseFlags", () => {
  test("gives the defaults", () => {
    expect(parseFlags(["--profile", "/p.json"])).toEqual({
      check: false,
      connect: true,
      extensions: [],
      glyphs: undefined,
      logEntities: false,
      model: undefined,
      nowPerCall: false,
      packetTrace: "off",
      profile: "/p.json",
      runDir: undefined,
      stopReflex: true,
      thinking: "off",
      wake: true,
    });
  });

  test("reads every flag", () => {
    const argv = [
      "--profile",
      "/p.json",
      "--run-dir",
      "/r",
      "--model",
      "faux/faux-1",
      "--thinking",
      "low",
      "--no-connect",
      "--wake",
      "off",
      "--glyphs",
      "ascii",
      "--stop-reflex",
      "off",
      "--now-per-call",
      "--log-entities",
      "--packet-trace",
      "headers",
      "--check",
    ];
    expect(parseFlags(argv)).toEqual({
      check: true,
      connect: false,
      extensions: [],
      glyphs: "ascii",
      logEntities: true,
      model: "faux/faux-1",
      nowPerCall: true,
      packetTrace: "headers",
      profile: "/p.json",
      runDir: "/r",
      stopReflex: false,
      thinking: "low",
      wake: false,
    });
  });

  test("collects repeated --extension paths as absolute paths in order", () => {
    const argv = [
      "--profile",
      "/p",
      "--extension",
      "b.ts",
      "--extension",
      "/x/a.ts",
    ];
    expect(parseFlags(argv).extensions).toEqual([resolve("b.ts"), "/x/a.ts"]);
  });

  test("defaults --profile to ~/.config/peon/config.toml", () => {
    expect(parseFlags([]).profile).toBe(defaultProfilePath());
    expect(parseFlags([], "/custom/home").profile).toBe(
      "/custom/home/.config/peon/config.toml",
    );
  });

  test("refuses an unknown thinking level", () => {
    expect(() => parseFlags(["--profile", "/p", "--thinking", "huge"])).toThrow(
      '--thinking must be one of off|minimal|low|medium|high|xhigh|max, not "huge".',
    );
  });

  test("refuses a wake value that is not on or off", () => {
    expect(() => parseFlags(["--profile", "/p", "--wake", "yes"])).toThrow(
      '--wake must be on or off, not "yes".',
    );
  });

  test("refuses a packet trace mode it does not know", () => {
    expect(() =>
      parseFlags(["--profile", "/p", "--packet-trace", "full"]),
    ).toThrow('--packet-trace must be off, headers or bodies, not "full".');
  });

  test("turns an unknown flag into a UsageError", () => {
    expect(() => parseFlags(["--profile", "/p", "--account", "X"])).toThrow(
      UsageError,
    );
  });

  test("names every flag in the usage text", () => {
    for (const flag of [
      "--profile",
      "--run-dir",
      "--model",
      "--thinking",
      "--no-connect",
      "--wake",
      "--glyphs",
      "--stop-reflex",
      "--now-per-call",
      "--log-entities",
      "--packet-trace",
      "--check",
    ]) {
      expect(USAGE).toContain(flag);
    }
  });
});

test("harnessStateDir is a fixed home path", () => {
  expect(harnessStateDir("/home/me")).toBe(
    "/home/me/.local/state/peon-harness",
  );
});
