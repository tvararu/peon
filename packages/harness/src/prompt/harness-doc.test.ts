import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { USAGE } from "#harness/config/flags";
import { installCommands } from "#harness/extension/commands";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
import { createTestRuntime } from "#test-support/runtime-fixture";

const DOC = `${import.meta.dir}/../../../../docs/harness.md`;

async function doc(): Promise<string> {
  return Bun.file(DOC).text();
}

async function commandNames(): Promise<string[]> {
  const { rt } = await createTestRuntime();
  const names: string[] = [];
  const record = (name: string) => {
    names.push(name);
  };
  const pi = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === "registerCommand" ? record : () => () => {},
    },
  );
  installCommands(pi as ExtensionAPI, rt);
  return names;
}

describe("docs/harness.md", () => {
  test("names every flag in USAGE", async () => {
    const text = await doc();
    const flags = [...new Set(USAGE.match(/--[a-z][a-z-]*/g) ?? [])].filter(
      (flag) => flag !== "--help",
    );
    expect(flags.length).toBeGreaterThan(5);
    expect(flags.filter((flag) => !text.includes(`\`${flag}`))).toEqual([]);
  });

  test("names every slash command", async () => {
    const text = await doc();
    const names = await commandNames();
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((name) => !text.includes(`\`/${name}`))).toEqual([]);
  });

  test("names every tool", async () => {
    const text = await doc();
    expect(
      Object.keys(TOOL_TEXT).filter((tool) => !text.includes(`\`${tool}\``)),
    ).toEqual([]);
  });

  test("names the stop keys and the credential exit code", async () => {
    const text = await doc();
    for (const word of [
      "`F9`",
      "`Esc`",
      "exit code 3",
      "`TYPESAFE_API_KEY`",
      "`TUICRAFT_GLYPHS`",
    ])
      expect(text).toContain(word);
  });
});
