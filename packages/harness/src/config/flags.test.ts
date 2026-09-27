import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODEL,
  harnessStateDir,
  parseFlags,
  USAGE,
  UsageError,
} from "#harness/config/flags";

describe("parseFlags", () => {
  test("gives the design H.8 defaults", () => {
    expect(parseFlags(["--profile", "/p.json"])).toEqual({
      check: false,
      connect: true,
      glyphs: undefined,
      logEntities: false,
      model: DEFAULT_MODEL,
      nowPerCall: false,
      profile: "/p.json",
      runDir: undefined,
      stopReflex: true,
      thinking: "high",
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
      "--check",
    ];
    expect(parseFlags(argv)).toEqual({
      check: true,
      connect: false,
      glyphs: "ascii",
      logEntities: true,
      model: "faux/faux-1",
      nowPerCall: true,
      profile: "/p.json",
      runDir: "/r",
      stopReflex: false,
      thinking: "low",
      wake: false,
    });
  });

  test("requires --profile", () => {
    expect(() => parseFlags([])).toThrow(UsageError);
    expect(() => parseFlags([])).toThrow("--profile <path> is required.");
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
      "--check",
    ]) {
      expect(USAGE).toContain(flag);
    }
  });
});

test("harnessStateDir is a fixed home path", () => {
  expect(harnessStateDir("/home/me")).toBe(
    "/home/me/.local/state/tuicraft-harness",
  );
});
