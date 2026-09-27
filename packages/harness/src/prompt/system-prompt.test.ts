import { describe, expect, test } from "bun:test";
import {
  buildSystemPrompt,
  type PromptInit,
} from "#harness/prompt/system-prompt";

const SPEC = `${import.meta.dir}/../../../../docs/archive/2026-09-26-pi-harness-epic-design.md`;
const TEMPLATE = "as {character}, a level {level} {race} {class}.";
const LINE_TAIL =
  "A human gives you tasks and can type to you at any time. You act only through your tools.";

async function approvedText(): Promise<string> {
  const spec = await Bun.file(SPEC).text();
  const section = spec.slice(spec.indexOf("### F. The Luna system prompt"));
  const start = section.indexOf("```text\n") + "```text\n".length;
  return section.slice(start, section.indexOf("\n```", start));
}

function init(patch: Partial<PromptInit>): PromptInit {
  return {
    character: "Kaelyn",
    className: undefined,
    level: undefined,
    race: undefined,
    ...patch,
  };
}

describe("buildSystemPrompt", () => {
  test("the approved text has 465 words", async () => {
    expect(
      (await approvedText()).split(/\s+/).filter((word) => word !== ""),
    ).toHaveLength(465);
  });

  test("is design F.1 word for word with the first sentence filled", async () => {
    const expected = (await approvedText()).replace(
      TEMPLATE,
      "as Fgklibhlflc, a level 10 Blood Elf Priest.",
    );
    const prompt = buildSystemPrompt({
      character: "Fgklibhlflc",
      className: "Priest",
      level: 10,
      race: "Blood Elf",
    });
    expect(prompt).toBe(expected);
  });

  test.each([
    [
      { className: "Priest", level: 10, race: "Blood Elf" },
      ", a level 10 Blood Elf Priest.",
    ],
    [{ className: "Priest", level: 10 }, ", a level 10 Priest."],
    [{ level: 10, race: "Orc" }, ", a level 10 Orc."],
    [{ level: 10 }, ", a level 10 character."],
    [{ className: "Warrior", race: "Orc" }, ", an Orc Warrior."],
    [{ className: "Priest", race: "Blood Elf" }, ", a Blood Elf Priest."],
    [{ className: "Mage" }, ", a Mage."],
    [{ race: "Undead" }, ", an Undead."],
    [{}, "."],
  ] as [Partial<PromptInit>, string][])("fills %p as '%s'", (patch, suffix) => {
    const [first] = buildSystemPrompt(init(patch)).split("\n");
    expect(first).toBe(
      `You play World of Warcraft 3.3.5a as Kaelyn${suffix} ${LINE_TAIL}`,
    );
  });

  test("changes nothing after the first line", async () => {
    const rest = (await approvedText()).split("\n").slice(1);
    expect(buildSystemPrompt(init({})).split("\n").slice(1)).toEqual(rest);
  });

  test.each([
    "When the human asks for a value that can change during a running action (health, mana, position, targets), call look first. Answer from the look result. Then continue the task.",
    "For level, zone, money and bags, the [now] line and journal are enough. Do not call look for them.",
    "A result that ends with Next gives the recommended call. Make that call unless the human changed the task or a newer result contradicts it.",
    'When the human or a goal names a unit or NPC, call interact(npc: "<name>") or travel(to: "<name>") first. If the name is not known, call look(find: "<role>") with within: 100. Explore only when these fail',
    'Towns and villages are safe areas. Hostile creatures for a task "near <town>" are outside the town. Keep exploring outward in new directions.',
    "When a route fails, walk 20-30 yd toward the goal, or go back to a point on the way. Then try the route again.",
  ])("has the rule '%s'", (rule) => {
    expect(buildSystemPrompt(init({}))).toContain(rule);
  });

  test.each([
    "Answer questions from the newest result or [now]",
    "expert coding assistant",
    "Show file paths clearly",
  ])("does not have '%s'", (text) => {
    expect(buildSystemPrompt(init({}))).not.toContain(text);
  });

  test("leaves no placeholder", () => {
    expect(buildSystemPrompt(init({ level: 3 }))).not.toMatch(/[{}]/);
  });
});
