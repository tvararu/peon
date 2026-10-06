import { describe, expect, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { spellParams, spellSpec, spellTool } from "#harness/areas/spells/tool";
import { expectSendKind } from "#test-support/tool-harness";

function accepts(args: Record<string, string | number | boolean>): boolean {
  try {
    validateToolArguments(
      { description: "probe", name: "probe", parameters: spellParams },
      { arguments: args, id: "c1", name: "probe", type: "toolCall" },
    );
    return true;
  } catch {
    return false;
  }
}

describe("spell tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(accepts(spellSpec.minimalArgs)).toBe(true);
  });

  test("do takes the seven verbs", () => {
    expect(accepts({ do: "cast", spell: "Frost Armor" })).toBe(true);
    expect(accepts({ do: "cancel_aura", spell: "Frost Armor" })).toBe(true);
    expect(accepts({ do: "bar", slot: 1 })).toBe(true);
    expect(accepts({ do: "mount" })).toBe(true);
    expect(accepts({ do: "dismount" })).toBe(true);
    expect(accepts({ do: "unlearn_profession", spell: "Mining" })).toBe(true);
    expect(accepts({ do: "destroy_totem", element: "earth" })).toBe(true);
    expect(accepts({ do: "dance" })).toBe(false);
    expect(accepts({})).toBe(false);
  });

  test("a sending call passes the send-kind check", async () => {
    await expectSendKind(spellTool, { do: "bar", item: "6948", slot: 12 });
  });

  test("the description stays within 60 words", () => {
    expect(spellSpec.text.description.split(/\s+/).length).toBeLessThanOrEqual(
      60,
    );
    expect(spellSpec.text.guidelines.length).toBeLessThanOrEqual(2);
  });
});
