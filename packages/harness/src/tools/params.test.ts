import { describe, expect, test } from "bun:test";
import {
  type ToolCall,
  type TSchema,
  validateToolArguments,
} from "@earendil-works/pi-ai";
import { lookTool } from "#harness/tools/look";
import {
  engageParams,
  interactParams,
  journalParams,
  lookParams,
  lootParams,
  recoverParams,
  restParams,
  socialParams,
  stopParams,
  travelParams,
} from "#harness/tools/params";
import { createTestRuntime } from "#test-support/runtime-fixture";

const ALL = {
  engageParams,
  interactParams,
  journalParams,
  lookParams,
  lootParams,
  recoverParams,
  restParams,
  socialParams,
  stopParams,
  travelParams,
};

function check(parameters: TSchema, args: ToolCall["arguments"]): unknown {
  return validateToolArguments(
    { description: "probe", name: "probe", parameters },
    { arguments: args, id: "c1", name: "probe", type: "toolCall" },
  );
}

describe("tool parameter schemas", () => {
  test("every parameter has a description", () => {
    for (const schema of Object.values(ALL)) {
      for (const property of Object.values(schema.properties)) {
        expect((property as { description?: string }).description).toBeString();
      }
    }
  });

  test("no call needs more than one required field", () => {
    for (const schema of Object.values(ALL))
      expect((schema.required ?? []).length).toBeLessThanOrEqual(1);
  });

  test("look accepts the design calls and rejects bad values", () => {
    expect(check(lookParams, {})).toEqual({});
    expect(check(lookParams, { find: "hostile", within: 30 })).toEqual({
      find: "hostile",
      within: 30,
    });
    expect(() => check(lookParams, { find: "monster" })).toThrow(
      "Validation failed",
    );
    expect(() => check(lookParams, { within: 3 })).toThrow("Validation failed");
  });

  test("engage coerces a string count", () => {
    expect(
      check(engageParams, { count: "3", target: "Springpaw Stalker" }),
    ).toEqual({ count: 3, target: "Springpaw Stalker" });
    expect(() => check(engageParams, { count: 11 })).toThrow(
      "Validation failed",
    );
  });

  test("journal needs about; travel needs to; interact needs npc", () => {
    expect(() => check(journalParams, {})).toThrow("Validation failed");
    expect(() => check(travelParams, {})).toThrow("Validation failed");
    expect(() => check(interactParams, { do: "buy" })).toThrow(
      "Validation failed",
    );
    expect(check(journalParams, { about: "log", since: "r4" })).toEqual({
      about: "log",
      since: "r4",
    });
  });

  test("social caps text at 255 characters and allows no do", () => {
    expect(
      check(socialParams, { text: "I'm level 10.", to: "Kaelyn" }),
    ).toEqual({ text: "I'm level 10.", to: "Kaelyn" });
    expect(() => check(socialParams, { text: "x".repeat(256) })).toThrow(
      "Validation failed",
    );
  });

  test("rest, recover, loot and stop accept an empty call", () => {
    for (const schema of [restParams, recoverParams, lootParams, stopParams])
      expect(check(schema, {})).toEqual({});
  });
});

describe("look find names", () => {
  test("a name in find fails validation with a hint to use name", async () => {
    const { rt } = await createTestRuntime();
    const prepare = lookTool(rt).prepareArguments;
    expect(() => prepare?.({ find: "Magistrix Erona" })).toThrow(
      'Validation failed for tool "look":\n  - find: find takes a kind (hostile, questgiver, vendor, ...). For a name use name: "Magistrix Erona".',
    );
    expect(prepare?.({ find: "vendor", within: 30 })).toEqual({
      find: "vendor",
      within: 30,
    });
  });
});
