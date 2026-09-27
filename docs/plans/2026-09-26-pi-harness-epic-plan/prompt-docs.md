# Pi harness, area prompt-docs (P1–P6) Implementation Plan

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Area overview

1. P1 builds the Luna system prompt: design F.1 word for word, with the first sentence filled from the character.
2. P2 writes the model-facing text of the ten tools (`label`, `description`, `guidelines`) in STE.
3. P3 installs the prompt for every LLM request (human turns and wake turns) and adds the tool notes after it.
4. P4 adds `mise harness`. P5 writes `docs/harness.md` with a drift test. P6 adds the README section and the AGENTS.md command lines.
5. No CLI verb changes here (R21, contract 3.3): `packages/cli/src/cli/help.ts`, `docs/manual.md` and `.claude/skills/tuicraft/SKILL.md` get no line from this area.

**Goal:** Luna gets the approved prompt and tool guidance on every turn, and a human can run and understand the harness from the docs.

**Architecture:** `prompt/system-prompt.ts` is a pure string builder. `prompt/guidelines.ts` is one constant table that `tools/define.ts` (A1) reads. `prompt/install.ts` registers two Pi hooks: `before_agent_start` (contract) and `context_with_system` (Contract issue 1). Docs are plain Markdown, checked by `mise lint:docs` and by one drift test.

**Tech Stack:** Bun, TypeScript (strict), `bun:test`, Pi 0.87.1 (`@earendil-works/pi-ai`, `pi-agent-core`, `pi-coding-agent`), mise.

**Spec:** `docs/plans/2026-09-26-pi-harness-epic-design.md` (section 6.F holds the prompt text), `docs/plans/2026-09-26-pi-harness-epic/harness-design.md` (sections B, E, F, H), and the interface contract `contract.md` (sections 2.15, 3.2, 3.3, 4.1).

## Contract issues

These are defects that I found in the contract. I did not change the contract. The tasks below plan around each one. The coordinator must rule on items 1, 2, 5 and 6.

1. **Wake turns do not fire `before_agent_start` (measured).** Contract 2.15 sets the prompt only in `before_agent_start`. Pi fires that hook only from `AgentSession.prompt()` (`pi-coding-agent/dist/core/agent-session.js:1283`). A wake (`pi.sendMessage(…, { triggerTurn: true })`, L10's `createDelivery.wake`) goes to `_runAgentPrompt` directly (`agent-session.js:1502-1507`), and the run's prompt options reset after every run (`:1100`). Measured with a faux provider (scratch probe, Pi 0.87.1): turn 1 (`prompt`) got the Luna text; turn 2 (`sendCustomMessage` with `triggerTurn: true`) got `You are an expert coding assistant operating inside pi, a coding agent harness.` Because RUNNING → end turn → wake is the main loop (design A.3), Luna would lose the prompt on every wake. **Plan:** P3 keeps the contract's `before_agent_start` return and also registers `context_with_system`, which replaces the leading system message on every LLM request (`runner.js:930-956`). The same probe with both hooks gave the Luna text on both turns.
2. **`promptGuidelines` never reach the model when the harness sets its own prompt (measured).** Pi renders tool guidelines only in its default prompt (`core/system-prompt.js:79-86`, the `else` branch of `buildSystemPromptSections`). A forced prompt is used as-is (`buildSystemPromptState`). Measured: with the forced prompt, the text `GUIDE-LOOK` from a tool's `promptGuidelines` was absent from the request; with Pi's default prompt, it was present. **Plan:** P1 stays F.1 word for word. P3 appends one `Tool notes:` block built from `TOOL_TEXT[tool].guidelines`, one line per guideline, `- <tool>: <line>`. A1 still passes `promptGuidelines` to Pi (harmless). Tool definitions (`description`) still reach the model through the tool declarations (measured: `tools: ["look"]` in both runs).
3. **L10 has the same gap as item 1 (forwarded, not fixed here).** L10's `[now]` message comes from `before_agent_start`, so a wake turn gets no `[now]` line. P3 cannot fix this: it does not own `events/install.ts`. The L-area writer must know.
4. **`InWorld` uses sentinel values.** `createReadyGate` gives race `"unknown"` for an unknown id (contract 2.3), and `level` is a number. P1 says unknown parts drop. **Plan:** P3 maps `"unknown"` and `""` to `undefined`, and a level of 0 or less to `undefined`, before it calls `buildSystemPrompt`. P3 tests it.
5. **P3 `Needs` is incomplete.** P3 also needs **P2** (tool notes) and **F5a** (`test-support/runtime-fixture.ts`). Its session test builds a Pi session directly from the SDK, because `test-support/faux-session.ts` (F6a) has no signature in the contract. P3 does not need F6a.
6. **P5 needs a test file that the contract does not list.** P5 adds `packages/harness/src/prompt/harness-doc.test.ts` (a new file, owner P5): a drift test that fails when `docs/harness.md` does not name a flag from `USAGE`, a slash command that `installCommands` registers, or a tool name. It needs **F3a** (`USAGE`), **U10** (`installCommands`), **P2** and **F5a** in addition to F6b. Wave 8 runs after all of them, so the order does not change. The file has no `harness-doc.ts` beside it, which breaks the colocation rule (`foo.ts` → `foo.test.ts`); the coordinator rules on its name and place.
7. **No owner can add the eval pointer to `docs/harness.md`.** E7 (`mise eval`) lands after P5, and P6 does not own `docs/harness.md`. **Plan:** P6 names `mise eval` in `README.md` and `AGENTS.md` only. If the coordinator gives P6 one "Evals" line in `docs/harness.md`, P6 adds the line from its Step 3b.
8. **Graders must not read the prompt from `session.jsonl` (inferred, not measured).** The Luna prompt is request-time text (the forced projection at `agent-session.js:1044-1059`, and `context_with_system` output is "used as returned"). Pi's session file may keep its default system sections. The evidence for the prompt is P3's faux test and the pane smoke, not the session file.
9. **The prompt level is stale after a level-up (minor).** `InWorld` is built once at ready (contract 2.3), so the first sentence keeps the level at connect until the next reconnect. A stale level keeps the prompt stable for the provider's prompt cache. The `[now]` line carries the current level. No change is planned.
10. **`mise harness --help` shows mise's task help, not the harness flags (measured with a scratch `mise.toml`, mise 2026.8.6).** Every other argument passes through unchanged (`mise harness --profile x --no-connect --glyphs ascii` gave the script `--profile x --no-connect --glyphs ascii`), and the script's exit code passes through (exit 2 stayed 2). P5's doc says so.

## Global Constraints

- Prompt text: design F.1 exactly, 415 words with placeholders (measured, `wc -w`). First sentence: `You play World of Warcraft 3.3.5a as <character>, a level <level> <race> <className>.`; unknown parts drop (`… as <character>.`).
- Tool labels: `Look`, `Travel`, `Engage`, `Loot`, `Interact`, `Rest`, `Recover`, `Social`, `Journal`, `Stop`.
- Model text holds no glyph, no JSON and no stack (design A.1 principle 4). Tool text is printable ASCII only.
- The prompt never names a hand method: relog, corpse legs, heading sweeps, bit decoding (design F.2).
- No password and no account name in any prompt text (design A.4 "Secrets", contract 2.1).
- Harness imports: `@tuicraft/core`, `@tuicraft/core/session`, the five lib helpers, test support, `@earendil-works/*`, `#harness/*`, `#test-support/*` only (contract 0.2).
- Style: `type` only, no comments, no `biome-ignore`, files at most 500 non-blank lines, `function` for named exports, one object argument when a list would wrap, no `mock.module`.
- Commit: `git add <exact paths>`, then `mise exec -- git commit` as a separate command; Conventional Commit subject of at most 50 characters, capitalised after the prefix; a 1–3 sentence body on why.
- Docs: present tense, no dated history, no `tmp/` path, and every `packages/<pkg>/src/...` path must exist (`mise lint:docs`, `packages/devtools/src/stale-docs.ts`).
- The legacy shell gets no new verb (R21).

## Review Focus

1. **A wake turn (a whisper or a run end while Luna is idle).** Expected: Luna gets the same prompt as on a human turn. Pinned by P3 Step 1 test `a wake turn gets the Luna prompt too`.
2. **A character whose race or class id core does not know.** Expected: the first sentence drops the unknown part and stays grammatical (`an Orc`, `a level 10 character`). Pinned by P1's fill table and P3's `unknown` mapping test.
3. **The harness starts before the world is ready (`--no-connect`, or a slow login).** Expected: the prompt names the profile's character and nothing else. Pinned by P3 test `before ready it names the profile character only`.
4. **A profile whose password or account name could leak into the prompt.** Expected: neither appears in the system prompt. Pinned by P3 test `never holds the password or the account name`.
5. **Docs drift: a flag or a slash command added after P5.** Expected: `mise test` fails and names the missing word. Pinned by P5's `harness-doc.test.ts`.

---

### Task P1: The Luna system prompt builder

**Files:**
- Create: `packages/harness/src/prompt/system-prompt.ts`
- Test: `packages/harness/src/prompt/system-prompt.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (needs F1 for the `#harness/*` imports map).
- Produces (contract 2.15, exact):

```ts
export type PromptInit = { character: string; level: number | undefined; race: string | undefined; className: string | undefined };
export function buildSystemPrompt(init: PromptInit): string;
```

- [ ] **Step 1: Write the failing test**

The test reads the approved text from the committed spec, so the builder cannot drift from what the maintainer approved (R33).

```ts
import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, type PromptInit } from "#harness/prompt/system-prompt";

const SPEC = `${import.meta.dir}/../../../../docs/plans/2026-09-26-pi-harness-epic-design.md`;
const TEMPLATE = "as {character}, a level {level} {race} {class}.";
const LINE_TAIL = "A human gives you tasks and can type to you at any time. You act only through your tools.";

async function approvedText(): Promise<string> {
  const spec = await Bun.file(SPEC).text();
  const section = spec.slice(spec.indexOf("### F. The Luna system prompt"));
  const start = section.indexOf("```text\n") + "```text\n".length;
  return section.slice(start, section.indexOf("\n```", start));
}

function init(patch: Partial<PromptInit>): PromptInit {
  return { character: "Kaelyn", level: undefined, race: undefined, className: undefined, ...patch };
}

describe("buildSystemPrompt", () => {
  test("the approved text has 415 words", async () => {
    expect((await approvedText()).split(/\s+/).filter((word) => word !== "")).toHaveLength(415);
  });

  test("is design F.1 word for word with the first sentence filled", async () => {
    const expected = (await approvedText()).replace(TEMPLATE, "as Fgklibhlflc, a level 10 Blood Elf Priest.");
    const prompt = buildSystemPrompt({ character: "Fgklibhlflc", level: 10, race: "Blood Elf", className: "Priest" });
    expect(prompt).toBe(expected);
  });

  test.each([
    [{ level: 10, race: "Blood Elf", className: "Priest" }, ", a level 10 Blood Elf Priest."],
    [{ level: 10, className: "Priest" }, ", a level 10 Priest."],
    [{ level: 10, race: "Orc" }, ", a level 10 Orc."],
    [{ level: 10 }, ", a level 10 character."],
    [{ race: "Orc", className: "Warrior" }, ", an Orc Warrior."],
    [{ race: "Blood Elf", className: "Priest" }, ", a Blood Elf Priest."],
    [{ className: "Mage" }, ", a Mage."],
    [{ race: "Undead" }, ", an Undead."],
    [{}, "."],
  ] as [Partial<PromptInit>, string][])("fills %p as '%s'", (patch, suffix) => {
    const [first] = buildSystemPrompt(init(patch)).split("\n");
    expect(first).toBe(`You play World of Warcraft 3.3.5a as Kaelyn${suffix} ${LINE_TAIL}`);
  });

  test("changes nothing after the first line", async () => {
    const rest = (await approvedText()).split("\n").slice(1);
    expect(buildSystemPrompt(init({})).split("\n").slice(1)).toEqual(rest);
  });

  test("leaves no placeholder", () => {
    expect(buildSystemPrompt(init({ level: 3 }))).not.toMatch(/[{}]/);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/prompt/system-prompt.test.ts`
Expected: FAIL with `Cannot find module '#harness/prompt/system-prompt'`.

- [ ] **Step 3: Write the implementation**

The body below is lines 3–26 of the F.1 block, copied exactly. It holds no backtick and no `${`, so a template literal keeps it unchanged.

```ts
export type PromptInit = { character: string; level: number | undefined; race: string | undefined; className: string | undefined };

const BODY = `Each turn starts with a [now] line: your health, place, target, attackers and the running action. Trust it over numbers in older messages.

How to work:
1. Start a task with look. It names each unit with a short id like u7. Use that id or the unit's name in other tools. Never invent coordinates, ids or names.
2. If the human only asks a question, answer it from look or journal. Do not move or fight.
3. Each tool does the whole job: travel walks the route, engage finds, fights and loots, interact talks to an NPC and does its business, recover brings you back to life.
4. travel, engage, rest and recover can take a minute. Wait for the result. Do not call look to check on them.
5. If a result says RUNNING, end your turn. A [game] message comes when the action ends. Then continue the task.
6. If the task needs a unit that look does not show, call travel with to "explore" (add a direction such as "explore north" if the human gave one) before you say that nothing is there.
7. Every result starts with a status word. If it is not DONE, the last line says "Next:". Do that step. Do not repeat a failed call unless something changed.
8. A "Danger:" line is urgent. Deal with it first.
9. If two different tries fail, tell the human what blocks you and what you tried.
10. If no tool can do the task, say so at once and name what is missing. Never use a tool that only looks similar.

The human:
- The human's words win over any "Next:" line and over a "Danger:" line.
- If the human says stop, everything is already stopped. Start nothing new, even if something attacks you, until the human says to continue. Tell the human about the danger.
- Answer questions from the newest result or [now], then continue the task unless the human changed it.

[game] messages are events: a whisper, an attack, a death, or an action that ended. Answer players who speak to you, with social. Ignore other chat.

Never write account names or passwords.

When the task is done, say what happened in one or two sentences, with numbers from the last result.`;

function characterKind({ level, race, className }: PromptInit): string {
  const kind = [race, className].filter((part) => part !== undefined).join(" ");
  if (level !== undefined) return `, a level ${level} ${kind || "character"}`;
  if (kind === "") return "";
  return `, ${/^[AEIOU]/.test(kind) ? "an" : "a"} ${kind}`;
}

export function buildSystemPrompt(init: PromptInit): string {
  const who = `${init.character}${characterKind(init)}`;
  return `You play World of Warcraft 3.3.5a as ${who}. A human gives you tasks and can type to you at any time. You act only through your tools.

${BODY}`;
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/prompt/system-prompt.test.ts && mise typecheck harness && mise lint packages/harness`
Expected: PASS (13 tests), tsc exit 0, biome exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/prompt/system-prompt.ts packages/harness/src/prompt/system-prompt.test.ts
mise exec -- git commit -m "feat: Add the Luna system prompt builder" -m "Luna gets the approved section F prompt, filled with the character. The test reads the text from the committed spec so the two cannot drift."
```

---

### Task P2: Model-facing tool text

**Files:**
- Create: `packages/harness/src/prompt/guidelines.ts`
- Test: `packages/harness/src/prompt/guidelines.test.ts`

**Interfaces:**
- Consumes: `ToolName` from `#harness/contract/result` (F2):

```ts
export type ToolName = "look" | "travel" | "engage" | "loot" | "interact" | "rest" | "recover" | "social" | "journal" | "stop";
```

- Produces (contract 2.15, exact). A1's `defineGameTool` reads `label`, `description` and `guidelines` (as `promptGuidelines`); P3 reads `guidelines`.

```ts
export type ToolText = { label: string; description: string; guidelines: string[] };
export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>>;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type { ToolName } from "#harness/contract/result";
import { TOOL_TEXT } from "#harness/prompt/guidelines";

const TOOLS: ToolName[] = ["look", "travel", "engage", "loot", "interact", "rest", "recover", "social", "journal", "stop"];
const LABELS = ["Look", "Travel", "Engage", "Loot", "Interact", "Rest", "Recover", "Social", "Journal", "Stop"];
const MAX_SENTENCE_WORDS = 25;
const MAX_DESCRIPTION_WORDS = 60;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/);
}

function texts(tool: ToolName): string[] {
  return [TOOL_TEXT[tool].description, ...TOOL_TEXT[tool].guidelines];
}

describe("TOOL_TEXT", () => {
  test("has text for the ten tools and no other", () => {
    expect(Object.keys(TOOL_TEXT).sort()).toEqual([...TOOLS].sort());
  });

  test("uses the contract labels", () => {
    expect(TOOLS.map((tool) => TOOL_TEXT[tool].label)).toEqual(LABELS);
  });

  test("keeps the design F.2 guideline lines", () => {
    expect(TOOL_TEXT.look.guidelines[0]).toBe("Use find to filter. The Nearest line includes units out of view.");
    expect(TOOL_TEXT.travel.guidelines[0]).toBe("Never invent coordinates. If a refusal gives floors, use one as the third number.");
    expect(TOOL_TEXT.engage.guidelines[0]).toBe("Leave target empty to fight the nearest hostile. Use quest to fight for a quest objective.");
    expect(TOOL_TEXT.interact.guidelines[0]).toBe("talk lists what an NPC offers. Your own quest log is journal.");
    expect(TOOL_TEXT.journal.guidelines[0]).toBe("log is history. It never loses events when you read it.");
  });

  test.each(TOOLS)("%s has one or two guidelines", (tool) => {
    expect(TOOL_TEXT[tool].guidelines.length).toBeGreaterThanOrEqual(1);
    expect(TOOL_TEXT[tool].guidelines.length).toBeLessThanOrEqual(2);
  });

  test.each(TOOLS)("%s text is short STE in printable ASCII", (tool) => {
    expect(TOOL_TEXT[tool].description.split(" ").length).toBeLessThanOrEqual(MAX_DESCRIPTION_WORDS);
    for (const text of texts(tool)) {
      expect(text).toMatch(/^[\x20-\x7e]+$/);
      expect(text).not.toContain(";");
      for (const sentence of sentences(text)) expect(sentence.split(" ").length).toBeLessThanOrEqual(MAX_SENTENCE_WORDS);
    }
  });

  test.each(TOOLS)("%s text names no hand method and no raw command", (tool) => {
    for (const text of texts(tool)) expect(text).not.toMatch(/\b(relog|heading|gps|goto|walkToward|corpse legs?)\b/i);
  });

  test("never teaches a secret", () => {
    expect(TOOL_TEXT.social.guidelines).toContain("Never put an account name or a password in text.");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/prompt/guidelines.test.ts`
Expected: FAIL with `Cannot find module '#harness/prompt/guidelines'`.

- [ ] **Step 3: Write the implementation**

Each description says what the tool does, what it returns or how long it waits, and when not to use it (contract 2.15, design B). Sentence lengths were checked with a scratch script: the longest sentence has 25 words, the longest description 47 words.

```ts
import type { ToolName } from "#harness/contract/result";

export type ToolText = { label: string; description: string; guidelines: string[] };

export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>> = {
  look: {
    label: "Look",
    description: "Shows your health, place, target and running action, and the nearest units, each with a short id like u7. It does not move you or act. Use it to start a task and to answer questions about the world.",
    guidelines: ["Use find to filter. The Nearest line includes units out of view.", "Use within to list every unit near you, for example within: 30."],
  },
  travel: {
    label: "Travel",
    description: "Walks to a unit, to your corpse or to a point, or explores in a direction. It waits until you arrive or it fails, up to two minutes. Use explore when look does not show a unit that the task needs. Do not use it to fight.",
    guidelines: ["Never invent coordinates. If a refusal gives floors, use one as the third number.", 'If a result says start_off_mesh, call travel with to "unstick". Then try the goal again.'],
  },
  engage: {
    label: "Engage",
    description: "Finds a hostile unit, walks to it, fights it and loots it. It waits until the fight ends, up to two minutes. With count or quest it fights more than one unit. It refuses when your health or mana is low or when another unit attacks you.",
    guidelines: ["Leave target empty to fight the nearest hostile. Use quest to fight for a quest objective.", "If it refuses because your health or mana is low, call rest. Then call engage again."],
  },
  loot: {
    label: "Loot",
    description: "Takes every item and the money from one corpse, one slot at a time. It walks to the corpse first. Leave target empty to loot the nearest lootable corpse within 30 yards.",
    guidelines: ["engage loots each kill already. Use loot only for a corpse that engage did not loot."],
  },
  interact: {
    label: "Interact",
    description: "Walks to an NPC and does one job with it: talk, accept or turn in a quest, gossip, buy, sell junk, train or repair. talk lists what the NPC offers, with a number for each line.",
    guidelines: ["talk lists what an NPC offers. Your own quest log is journal.", 'For buy, what can be part of an item name, for example "water".'],
  },
  rest: {
    label: "Rest",
    description: "Eats and drinks from your bags until your health and mana reach a percent. It waits up to 30 seconds and stops if a unit attacks you. It refuses in combat and when you are dead.",
    guidelines: ["Rest before a fight when your health is under 50% or your mana is under 30%."],
  },
  recover: {
    label: "Recover",
    description: "Brings you back to life after a death. It releases your spirit, walks your ghost to your corpse and takes the corpse back. It can also use a spirit healer or accept a resurrection. It waits until you are alive or it fails.",
    guidelines: ["Use recover at once when a result says that you are dead. Do not use travel as a ghost."],
  },
  social: {
    label: "Social",
    description: "Sends one chat message or does one group action: say, whisper, party, guild, invite, accept or decline an invite, or leave the group. It waits up to 2 seconds for the server to confirm it.",
    guidelines: ['To answer a whisper, set do to "whisper" and to to the exact name from the [game] line.', "Never put an account name or a password in text."],
  },
  journal: {
    label: "Journal",
    description: "Reads your own records: your quest log, your bags and equipped items, the spells you know, or the game log of what happened earlier. It does not move you or act.",
    guidelines: ["log is history. It never loses events when you read it.", "Use bags to name an equipped item, for example the item in your main hand."],
  },
  stop: {
    label: "Stop",
    description: "Stops one running action, or everything when run is empty. It stops movement, attacks and the fight helper. An attacker does not stop when you stop.",
    guidelines: ["Use stop only when the task changes. Do not use it to wait for an action."],
  },
};
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/prompt/guidelines.test.ts && mise typecheck harness && mise lint packages/harness`
Expected: PASS (34 tests), tsc exit 0, biome exit 0. If biome's formatter wants the long strings wrapped, run `mise format:fix packages/harness/src/prompt` and run the tests again.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/prompt/guidelines.ts packages/harness/src/prompt/guidelines.test.ts
mise exec -- git commit -m "feat: Add model-facing text for the ten tools" -m "A small model needs one short description and one or two usage lines per tool. The text is STE and ASCII so the model reads it one way only."
```

---

### Task P3: Install the prompt for every turn

**Needs:** P1, P2, F5c, F5ab, F7a, L10b ([plan index](../2026-09-26-pi-harness-epic-plan.md); L10b lands `installEvents` in `extension.ts` first).

**Files:**
- Create: `packages/harness/src/prompt/install.ts`
- Modify: `packages/harness/src/extension/extension.ts` (insertion point from F7a: one import line and the line `installPrompt(pi, rt);` between `installEvents(pi, rt);` and `installUi(pi, rt);`, nothing else)
- Test: `packages/harness/src/prompt/install.test.ts`

**Interfaces:**
- Consumes:

```ts
// P1
export type PromptInit = { character: string; level: number | undefined; race: string | undefined; className: string | undefined };
export function buildSystemPrompt(init: PromptInit): string;
// P2
export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>>;
// F2 contract/services.ts, contract/views.ts
export type ReadyGate = HandleObserver & { isReady: () => boolean; whenReady: (timeoutMs: number) => Promise<boolean>; inWorld: () => InWorld | undefined; onReady: (cb: (world: InWorld) => void) => Unsubscribe };
export type InWorld = { char: string; guid: string; account: string; level: number; className: string; race: string; mapId: number; zoneId: number | undefined; zone: string | undefined; pose: { mapId: number; x: number; y: number; z: number }; capabilities: Capabilities; at: number };
// HarnessRuntime members used: ready, profile (character, account, client.password), clock
// F5a test-support/runtime-fixture.ts
export function createTestRuntime(init?: TestRuntimeInit): Promise<TestRuntime>;
// Pi 0.87.1
import { getCurrentSystemMessage } from "@earendil-works/pi-ai";   // (messages: TranscriptMessages) => SystemMessage | undefined
// pi.on("before_agent_start", h) returns { systemPrompt?: string }; pi.on("context_with_system", h) returns { messages?: AgentMessage[] }
```

- Produces (contract 2.15, exact): `export function installPrompt(pi: ExtensionAPI, rt: HarnessRuntime): void;`
- Behaviour: both hooks give the same text, `buildSystemPrompt(init)` + `"\n\nTool notes:\n"` + one `- <tool>: <guideline>` line per guideline in `ToolName` order of `TOOL_TEXT`. `init` comes from `rt.ready.inWorld()` (with `"unknown"`, `""` and level ≤ 0 mapped to `undefined`), else `{ character: rt.profile.character }` with the rest `undefined`.

- [ ] **Step 1: Write the failing test**

The last test builds a real Pi session on the faux provider. It is the only test that catches Contract issue 1. It passes `InMemoryCredentialStore` and a temp `agentDir`, because a bare `ModelRuntime.create()` writes `~/.pi/agent/auth.json` (measured in the scratch probe).

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxProvider, getCurrentSystemPrompt, InMemoryCredentialStore, type TranscriptMessages, Type } from "@earendil-works/pi-ai";
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionAPI,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime, ReadyGate } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { installPrompt } from "#harness/prompt/install";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Handler = (event: unknown, ctx: unknown) => unknown;

const WORLD: InWorld = {
  char: "Fgklibhlflc",
  guid: "1a2b",
  account: "FAC66F5A1B200",
  level: 10,
  className: "Priest",
  race: "Blood Elf",
  mapId: 530,
  zoneId: 3430,
  zone: "Eversong Woods",
  pose: { mapId: 530, x: 8735, y: -6685, z: 20 },
  capabilities: { factions: true, spells: true, navigation: true, jev: false },
  at: 0,
};
const FIRST = "You play World of Warcraft 3.3.5a as Fgklibhlflc, a level 10 Blood Elf Priest. A human";

function readyWith(world: InWorld | undefined): ReadyGate {
  const ready = world !== undefined;
  return { attach: () => () => {}, isReady: () => ready, whenReady: async () => ready, inWorld: () => world, onReady: () => () => {} };
}

async function installed(world: InWorld | undefined): Promise<{ rt: HarnessRuntime; fire: (name: string, event: unknown) => Promise<unknown> }> {
  const { rt } = await createTestRuntime({ parts: { ready: readyWith(world) } });
  const handlers = new Map<string, Handler>();
  const on = (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return () => {};
  };
  installPrompt({ on } as unknown as ExtensionAPI, rt);
  const fire = async (name: string, event: unknown) => handlers.get(name)?.(event, {});
  return { rt, fire };
}

async function systemPrompt(world: InWorld | undefined): Promise<string> {
  const { fire } = await installed(world);
  const result = (await fire("before_agent_start", { type: "before_agent_start", prompt: "hi" })) as { systemPrompt: string };
  return result.systemPrompt;
}

describe("installPrompt", () => {
  test("before_agent_start gives the filled prompt and the tool notes", async () => {
    const prompt = await systemPrompt(WORLD);
    expect(prompt).toStartWith(FIRST);
    expect(prompt).toContain("\n\nTool notes:\n- look: Use find to filter. The Nearest line includes units out of view.\n");
    expect(prompt).toContain("- journal: log is history. It never loses events when you read it.");
    expect(prompt.split("\n").filter((line) => line.startsWith("- stop: "))).toHaveLength(1);
  });

  test("before ready it names the profile character only", async () => {
    const { rt, fire } = await installed(undefined);
    const result = (await fire("before_agent_start", { type: "before_agent_start", prompt: "hi" })) as { systemPrompt: string };
    expect(result.systemPrompt).toStartWith(`You play World of Warcraft 3.3.5a as ${rt.profile.character}. A human`);
  });

  test("drops unknown race, class and level", async () => {
    expect(await systemPrompt({ ...WORLD, race: "unknown", className: "unknown", level: 0 })).toStartWith("You play World of Warcraft 3.3.5a as Fgklibhlflc. A human");
    expect(await systemPrompt({ ...WORLD, race: "unknown" })).toStartWith("You play World of Warcraft 3.3.5a as Fgklibhlflc, a level 10 Priest. A human");
  });

  test("never holds the password or the account name", async () => {
    const { rt, fire } = await installed(WORLD);
    const result = (await fire("before_agent_start", { type: "before_agent_start", prompt: "hi" })) as { systemPrompt: string };
    expect(result.systemPrompt).not.toContain(rt.profile.client.password);
    expect(result.systemPrompt).not.toContain(rt.profile.account);
    expect(result.systemPrompt).not.toContain(WORLD.account);
  });

  test("context_with_system puts the prompt first and keeps the tools", async () => {
    const { fire } = await installed(WORLD);
    const tool = { name: "look", description: "Look.", parameters: Type.Object({}) };
    const user: AgentMessage = { role: "user", content: [{ type: "text", text: "hi" }], timestamp: 2 };
    const messages: AgentMessage[] = [
      { role: "system", content: "You are an expert coding assistant.", toolsAdded: [tool], timestamp: 1 },
      user,
      { role: "system", content: "", sections: { rules: "- Be concise" }, timestamp: 3 },
    ];
    const result = (await fire("context_with_system", { type: "context_with_system", messages })) as { messages: AgentMessage[] };
    const [head, ...rest] = result.messages;
    expect(head?.role).toBe("system");
    expect(getCurrentSystemPrompt(result.messages)).toStartWith(FIRST);
    expect(getCurrentSystemPrompt(result.messages)).not.toContain("coding assistant");
    expect(head?.role === "system" ? head.toolsAdded?.map((t) => t.name) : undefined).toEqual(["look"]);
    expect(rest).toEqual([user]);
  });

  test("a wake turn gets the Luna prompt too", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harness-prompt-"));
    const { rt } = await createTestRuntime({ parts: { ready: readyWith(WORLD) } });
    const faux = fauxProvider({ provider: "faux-prompt", models: [{ id: "m1" }] });
    const seen: string[] = [];
    const reply = (context: { messages: TranscriptMessages }) => {
      seen.push(getCurrentSystemPrompt(context.messages));
      return fauxAssistantMessage("ok");
    };
    faux.setResponses([reply, reply]);
    const factory: CreateAgentSessionRuntimeFactory = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
      modelRuntime.registerNativeProvider(faux.provider);
      const settingsManager = SettingsManager.inMemory({ quietStartup: true, compaction: { enabled: false } });
      const extensionFactories = [{ name: "prompt", factory: (pi: ExtensionAPI) => installPrompt(pi, rt) }];
      const resourceLoaderOptions = { noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true, noThemes: true, extensionFactories };
      const services = await createAgentSessionServices({ cwd, agentDir, modelRuntime, settingsManager, resourceLoaderOptions });
      const created = await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: faux.getModel(), thinkingLevel: "off", noTools: "builtin" });
      return { ...created, services, diagnostics: services.diagnostics };
    };
    const runtime = await createAgentSessionRuntime(factory, { cwd: dir, agentDir: join(dir, "agent"), sessionManager: SessionManager.inMemory(dir) });
    try {
      await runtime.session.prompt("hello");
      await runtime.session.sendCustomMessage({ customType: "wow-event", content: "[game 0s] Kaelyn whispers: hi", display: true }, { triggerTurn: true });
    } finally {
      await runtime.dispose();
      await rm(dir, { recursive: true, force: true });
    }
    expect(seen).toHaveLength(2);
    for (const prompt of seen) expect(prompt).toStartWith(FIRST);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/prompt/install.test.ts`
Expected: FAIL with `Cannot find module '#harness/prompt/install'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { getCurrentSystemMessage, type SystemMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
import { buildSystemPrompt, type PromptInit } from "#harness/prompt/system-prompt";

function known(value: string): string | undefined {
  return value === "" || value === "unknown" ? undefined : value;
}

function fromWorld(world: InWorld): PromptInit {
  const level = world.level > 0 ? world.level : undefined;
  return { character: world.char, level, race: known(world.race), className: known(world.className) };
}

function promptInit(rt: HarnessRuntime): PromptInit {
  const world = rt.ready.inWorld();
  if (world) return fromWorld(world);
  return { character: rt.profile.character, level: undefined, race: undefined, className: undefined };
}

function toolNotes(): string {
  const tools = Object.keys(TOOL_TEXT) as ToolName[];
  const lines = tools.flatMap((tool) => TOOL_TEXT[tool].guidelines.map((line) => `- ${tool}: ${line}`));
  return `Tool notes:\n${lines.join("\n")}`;
}

function lunaPrompt(rt: HarnessRuntime): string {
  return `${buildSystemPrompt(promptInit(rt))}\n\n${toolNotes()}`;
}

function withPrompt(messages: AgentMessage[], prompt: string, now: number): AgentMessage[] {
  const current = getCurrentSystemMessage(messages);
  const tools = current?.toolsAdded ? { toolsAdded: current.toolsAdded } : {};
  const head: SystemMessage = { role: "system", content: prompt, timestamp: current?.timestamp ?? now, ...tools };
  return [head, ...messages.filter((message) => message.role !== "system")];
}

export function installPrompt(pi: ExtensionAPI, rt: HarnessRuntime): void {
  pi.on("before_agent_start", () => ({ systemPrompt: lunaPrompt(rt) }));
  pi.on("context_with_system", (event) => ({ messages: withPrompt(event.messages, lunaPrompt(rt), rt.clock.now()) }));
}
```

Then add the insertion point to `packages/harness/src/extension/extension.ts` (one import line in the import block, one call line):

```ts
import { installPrompt } from "#harness/prompt/install";
```

```ts
    installEvents(pi, rt);
    installPrompt(pi, rt);
    installUi(pi, rt);
```

If `installEvents` or `installUi` are not in the file yet (L10 or U11 has not landed), put `installPrompt(pi, rt);` at its contract position: after every line above it in contract 2.5 that exists, and before every line below it that exists.

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/prompt/install.test.ts && mise test packages/harness/src/extension && mise typecheck harness && mise lint packages/harness`
Expected: PASS (6 tests in `install.test.ts`), the extension tests pass, tsc exit 0, biome exit 0.

Check by hand (do not commit this change) that the session test proves Contract issue 1. Delete the `pi.on("context_with_system", …)` line, run `mise test packages/harness/src/prompt/install.test.ts -t "wake turn"`, and see it FAIL with `Expected: "You play World of Warcraft 3.3.5a as Fgklibhlflc, …"` against `Received: "You are an expert coding assistant operating inside pi, …"`. Restore the line (`git diff packages/harness/src/prompt/install.ts` must show only the new file).

- [ ] **Step 5: Orca pane smoke (the harness substitute for the live gate; needs F6b landed)**

If `~/.local/share/tuicraft/namigator/*/libnamigator.so` is absent, run `mise namigator:build` first: `soap create` needs that library, and a missing library is not a SOAP fault.

Run this from the builder's child worktree root (the epic worktree does not hold P3 before it lands). It uses two throwaway soap accounts (AGENTS.md "Testing") and deletes both at the end. The profile files hold a password, so `umask 077`.

```bash
umask 077
W=$(git rev-parse --show-toplevel)
bun packages/factory/src/main.ts soap create eversong10 > "$XDG_RUNTIME_DIR/p3-a.json"
bun packages/factory/src/main.ts soap create eversong10 > "$XDG_RUNTIME_DIR/p3-b.json"
A=$(jq -r .account "$XDG_RUNTIME_DIR/p3-a.json"); CA=$(jq -r .character "$XDG_RUNTIME_DIR/p3-a.json")
B=$(jq -r .account "$XDG_RUNTIME_DIR/p3-b.json"); CB=$(jq -r .character "$XDG_RUNTIME_DIR/p3-b.json")
RUN=$(mktemp -d)/run
orca-ide terminal create --worktree "path:$W" --title p3-prompt-smoke --command "cd $W && bun packages/harness/src/entry.ts --profile $XDG_RUNTIME_DIR/p3-a.json --run-dir $RUN --glyphs nerd" --json
```

With the returned terminal id `$T`:

1. Wait until `orca-ide terminal read --terminal $T --screen --json` shows the footer (the connection chip is online).
2. `orca-ide terminal send --terminal $T --text "Who are you, and what game do you play? Answer in one sentence. Do not use tools." --enter --json`
3. Read the screen until the agent answer shows. Expected: the answer names `$CA` and World of Warcraft, and no tool row shows.
4. Send a whisper from account B: `$(jq -r .wrapper "$XDG_RUNTIME_DIR/p3-b.json") send -w "$CA" "hi, what level are you?"`.
5. Read the screen for up to 60 s. Expected: a `[game]` card for the whisper, then a `social` tool row that whispers `$CB` with a level. This is the wake path of Contract issue 1 in the real TUI.
6. Quit: send `$'\x04'` on an empty editor, confirm with `read --screen`, then `orca-ide terminal close --terminal $T --tab --json`.
7. `rg -uu -F -l "$(jq -r .password "$XDG_RUNTIME_DIR/p3-a.json")" "$RUN"` prints nothing.
8. Clean up: `$(jq -r .wrapper "$XDG_RUNTIME_DIR/p3-b.json") stop`, then `bun packages/factory/src/main.ts soap delete "$A"`, `bun packages/factory/src/main.ts soap delete "$B"`, `rm "$XDG_RUNTIME_DIR/p3-a.json" "$XDG_RUNTIME_DIR/p3-b.json"`.

If the server or SOAP is down, record that and defer to the coordinator (AGENTS.md "Testing"). Do not claim the smoke passed without steps 3 and 5. Put the two screen captures (without any password) in the commit body or report them to the coordinator. F8e keeps the formal live record.

- [ ] **Step 6: Commit**

```bash
git add packages/harness/src/prompt/install.ts packages/harness/src/prompt/install.test.ts packages/harness/src/extension/extension.ts
mise exec -- git commit -m "feat: Install the Luna prompt on every turn" -m "Pi fires before_agent_start only for human prompts, so wake turns got the coding-assistant prompt. context_with_system sets the same text on every request and adds the tool notes that a custom prompt drops."
```

---

### Task P4: The `mise harness` task

**Files:**
- Modify: `mise.toml` (add one task block before `[tasks."evidence:encounter"]`; E7 later adds `[tasks.eval]` after it)
- Test: a command check in Steps 1 and 4 (a config change has no `bun:test` home; the check runs the real task)

**Interfaces:**
- Consumes: `bun packages/harness/src/entry.ts` (F6b), flags from design H.8 via `parseFlags` (F3a), `--check` (profile, lock, run dir, credential, then exit 0; F6b).
- Produces: `mise harness <flags>`, which runs `bun packages/harness/src/entry.ts <flags>` with the terminal attached (`raw = true`) and no mise header line (`quiet = true`). E7 and P6 name it.

- [ ] **Step 1: Write the failing check**

If `~/.local/share/tuicraft/namigator/*/libnamigator.so` is absent, run `mise namigator:build` first: `soap create` needs that library, and a missing library is not a SOAP fault.

```bash
umask 077
bun packages/factory/src/main.ts soap create eversong10 > "$XDG_RUNTIME_DIR/p4.json"
mise harness --profile "$XDG_RUNTIME_DIR/p4.json" --run-dir "$(mktemp -d)/run" --check; echo "exit=$?"
```

- [ ] **Step 2: Run it and see it fail**

Expected: mise prints an error that no task named `harness` exists, and `exit=` is not 0.

- [ ] **Step 3: Add the task**

Insert this block in `mise.toml` directly before `[tasks."evidence:encounter"]`:

```toml
[tasks.harness]
description = "Run the Pi harness; pass harness flags after the task name (docs/harness.md)"
raw = true
quiet = true
run = "bun packages/harness/src/entry.ts"
```

Mise appends every argument after `harness` to `run` (measured with a scratch `mise.toml`, mise 2026.8.6: `mise harness --profile x --no-connect --glyphs ascii` gave the script exactly those five words), and the exit code passes through (a script `exit 2` gave `exit=2`). `mise harness --help` is taken by mise itself.

- [ ] **Step 4: Run the check and see it pass**

Run the Step 1 command again.
Expected: one line `Codex login: valid until <YYYY-MM-DD HH:MM> UTC (omp).` and `exit=0`. If omp has no Codex login or it expires in under 10 minutes, the line is the contract 2.2 failure text and `exit=3`: that is the correct result of the task, and the fix is to run omp once.

Then run `mise tasks info harness` and see `Run: bun packages/harness/src/entry.ts`. Then `mise lint:docs` (it must stay green; `mise.toml` is not scanned, but the task description names `docs/harness.md`, which P5 creates, so nothing scans that name yet).

Clean up: `bun packages/factory/src/main.ts soap delete "$(jq -r .account "$XDG_RUNTIME_DIR/p4.json")"` and `rm "$XDG_RUNTIME_DIR/p4.json"`.

- [ ] **Step 5: Commit**

```bash
git add mise.toml
mise exec -- git commit -m "chore: Add the mise harness task" -m "Humans and graders start the harness the same way, with the terminal attached. Flags pass through to the entry file unchanged."
```

---

### Task P5: `docs/harness.md` and its drift test

**Files:**
- Create: `docs/harness.md`
- Create: `packages/harness/src/prompt/harness-doc.test.ts` (Contract issue 6)
- Test: `packages/harness/src/prompt/harness-doc.test.ts`, and `mise lint:docs` (it scans `docs/*.md`)

**Interfaces:**
- Consumes:

```ts
// F3a config/flags.ts
export const USAGE: string;            // names every flag as --<name>
// U10 extension/commands.ts
export function installCommands(pi: ExtensionAPI, rt: HarnessRuntime): void;   // calls pi.registerCommand(name, …)
// P2
export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>>;
// F5a
export function createTestRuntime(init?: TestRuntimeInit): Promise<TestRuntime>;
```

- Produces: `docs/harness.md`, which P6's README section and AGENTS.md lines link to.

- [ ] **Step 1: Write the failing test**

```ts
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
  const pi = new Proxy({}, { get: (_target, key) => (key === "registerCommand" ? record : () => () => {}) });
  installCommands(pi as ExtensionAPI, rt);
  return names;
}

describe("docs/harness.md", () => {
  test("names every flag in USAGE", async () => {
    const text = await doc();
    const flags = [...new Set(USAGE.match(/--[a-z][a-z-]*/g) ?? [])].filter((flag) => flag !== "--help");
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
    expect(Object.keys(TOOL_TEXT).filter((tool) => !text.includes(`\`${tool}\``))).toEqual([]);
  });

  test("names the stop keys and the credential exit code", async () => {
    const text = await doc();
    for (const word of ["`F9`", "`Esc`", "exit code 3", "`TYPESAFE_API_KEY`", "`TUICRAFT_GLYPHS`"]) expect(text).toContain(word);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/prompt/harness-doc.test.ts`
Expected: FAIL in all four tests with `ENOENT` for `docs/harness.md`.

- [ ] **Step 3: Write `docs/harness.md`**

Before you write, read `USAGE` in `packages/harness/src/config/flags.ts` and the `registerCommand` calls in `packages/harness/src/extension/commands.ts`. The text below uses the contract spellings. If a landed spelling differs, use the landed one and tell the coordinator.

````markdown
# Pi harness

The Pi harness is an interactive terminal agent that plays one World of
Warcraft 3.3.5a character. A model (by default `openai-codex/gpt-6-luna`
at high thinking) acts through ten game tools. A human watches the same
terminal and can type to the agent at any time. The harness is a second
shell over `@tuicraft/core`, beside the `tuicraft` CLI. It adds no CLI
verb.

## Run it

1. Log in to Codex once with omp (`omp`, provider `openai-codex`). The
   harness reads that login and never refreshes it.
2. Make a throwaway character. The command prints a JSON profile that
   holds a password, so keep the file private:

   ```
   umask 077
   bun packages/factory/src/main.ts soap create eversong10 > "$XDG_RUNTIME_DIR/char.json"
   ```

3. Start the harness from the repository root:

   ```
   mise harness --profile "$XDG_RUNTIME_DIR/char.json"
   ```

   `mise harness` runs `bun packages/harness/src/entry.ts` with the same
   flags. `mise harness --help` shows the mise task, not these flags.
4. Type a task, for example `Kill one Springpaw Stalker north of town.`
5. Quit with Ctrl-D on an empty editor, or with two Ctrl-C within half a
   second. Then delete the character with
   `bun packages/factory/src/main.ts soap delete <ACCOUNT>`.

To check the profile, the lock and the Codex login without a game
connection, add `--check`. The harness prints one line and exits.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--profile <path>` | required | The character to play: a soap session JSON, a soap ledger JSON, or a tuicraft `config.toml`. There is no default profile. |
| `--run-dir <path>` | `~/.local/state/tuicraft-harness/runs/<utc>-<character>` | Where the run files go. The harness refuses a directory that already has `gamelog.jsonl`. |
| `--model <provider/id>` | `openai-codex/gpt-6-luna` | The model from Pi's bundled catalog. |
| `--thinking <level>` | `high` | The Pi thinking level. |
| `--no-connect` | off | Start without a game connection. Use `/connect` later. |
| `--wake on\|off` | `on` | When off, game events do not start an agent turn. |
| `--glyphs nerd\|unicode\|ascii` | `nerd`, or `TUICRAFT_GLYPHS` | The glyph set of the human UI. The model text never has glyphs. |
| `--stop-reflex on\|off` | `on` | When on, a short human message that starts with stop, halt, freeze or hold stops every action before the model reads it. |
| `--now-per-call` | off | Adds the `[now]` line before every model call, not only at the start of a turn. |
| `--log-entities` | off | Writes raw entity rows to the game log. |
| `--check` | off | Checks the profile, the lock and the Codex login, then exits with code 0. |

The harness reads no `WOW_*` variable. Only `--profile` selects the
character.

## Credentials and safety

- **Codex login.** The harness reads the newest `openai-codex` login from
  omp's database (`~/.omp/agent/agent.db`), read-only. At start it prints
  `Codex login: valid until <time> UTC (omp).` When there is no login, or
  when the login expires in less than 10 minutes, it prints what to do
  and stops with exit code 3. Run omp once so that it refreshes the
  login, then start the harness again. If the login expires during a
  session, the next model call fails with the same advice. `/login` and
  `/logout` do not change the login that the harness uses.
- **Fight helper.** `engage` uses Jev for split-second fight decisions. Jev
  needs `TYPESAFE_API_KEY` in the environment. Without it, `engage`
  refuses with `no_combat_helper` and the footer shows a red `no-jev`
  chip.
- **Protected characters.** The harness refuses the accounts `ADMIN`,
  `DEITY`, `X`, `Y`, `AUCTIONHOUSE`, `TCFACTORY`, `TCPRESETS`, every
  account that starts with `RNDBOT`, and the character `Xiara`. There is
  no flag to override this.
- **One owner per character.** A lock file
  `~/.local/state/tuicraft-harness/locks/<ACCOUNT>-<character>.lock`
  stops a second harness. The harness also refuses a character that a
  `tuicraft` daemon holds. A lock from a dead process is replaced.
- **Secrets.** No log, run file or tool result holds the password. The
  `social` tool refuses chat text that contains the account name or the
  password.

## Tools

The model uses only these ten tools. Each result starts with a status
word (`DONE`, `PARTLY`, `RUNNING`, `UNCONFIRMED`, `REFUSED`, `FAILED`).
A result that is not `DONE` ends with a `Next:` step.

| Tool | What it does |
|---|---|
| `look` | Self, place, target, the running action, and the nearest units with short ids like `u7`. |
| `travel` | Walks to a unit, the corpse or a point, explores in a direction, or unsticks. |
| `engage` | Chooses a target, walks to it, fights it with Jev and loots it. |
| `loot` | Loots one corpse, one slot at a time. |
| `interact` | Talks to an NPC: quests, gossip, buy, sell junk, train, repair. |
| `rest` | Eats and drinks until health and mana reach a percent. |
| `recover` | Comes back to life: corpse run, spirit healer or a resurrection offer. |
| `social` | One chat message or one group action. |
| `journal` | Quest log, bags and gear, spells, or the game log. |
| `stop` | Stops one action or everything. |

`travel`, `engage`, `rest` and `recover` start a run (`r1`, `r2`, …).
Only one run can be active. The tool waits for the run to end and
streams its progress. When the human types, or after 120 seconds, the
tool returns `RUNNING`, the run continues, and a `[game]` message tells
the agent when it ends.

The system prompt is in `packages/harness/src/prompt/system-prompt.ts`.
The tool descriptions and usage lines are in
`packages/harness/src/prompt/guidelines.ts`.

## Stopping the agent

- Type `stop` (or `Stop!`, `halt`, `freeze`, `hold`, at most five words).
  The harness stops every run and halts the character before the model
  reads the message.
- `/stop` does the same.
- `F9` does the same from any screen.
- `Esc` aborts the model's turn. The harness then stops every run and
  halts the character.

Other human text while the agent works goes to the agent at the next
step. Action tools refuse until the agent reads it.

## Commands

| Command | What it does |
|---|---|
| `/now` | Shows the last `[now]` line exactly as the model got it. |
| `/log [filter]` | Shows the last 20 game-log rows, filtered by words, `from:Name` or `domain:<name>`. |
| `/stop` | Stops every run and halts the character. |
| `/connect` | Connects to the game after `--no-connect` or a lost connection. |
| `/disconnect` | Logs the character out and keeps the harness open. |
| `/say <text>` | Says the text in game. |
| `/w <name> <text>` | Whispers a player. |
| `/p <text>` | Writes to the party. |
| `/g <text>` | Writes to the guild. |
| `/wake on\|off` | Turns game-event wakes on or off. |
| `/snapshot <label>` | Writes the current world state to `snapshots/<label>.json` in the run directory. |

Pi's own commands (`/new`, `/resume`, `/fork`, `/reload`, `/model`, …)
also work. The game connection stays open across `/new`, `/resume`,
`/fork` and `/reload`.

## Screen

- **Footer (4 rows).** Your unit frame, the target, place and money, and
  a chrome row: model, thinking, context, wake, glyph set, log rows,
  unread whispers, and red chips for a missing helper (`no-jev`,
  `no-nav`, `no-factions`). The footer shows the same facts as the
  `[now]` line.
- **Ticker (6 rows, above the editor).** The live run, then the newest
  game events, also the ones that do not wake the agent.
- **Event cards.** Each `[game]` message is one line per event with a
  glyph, the time and the text.
- **Human-only lines.** Packet errors, server corrections and not-yet-built
  notices. The model never sees them.
- **Tool rows.** Each tool call shows one call line and a short result.
  Press `ctrl+o` to expand a result. Run tools redraw their progress
  while they work.
- **Title and working line.** The tab title shows danger, for example
  `ATTACKED`. The working line shows the run in game words.

Use a terminal font with Nerd Font glyphs for `--glyphs nerd`. Use
`unicode` or `ascii` in other terminals.

## Run directory

| File | Content |
|---|---|
| `meta.json` | Version, git sha, account and character (no password), model, thinking, glyph set, flags, start and end, exit reason, capabilities. |
| `gamelog.jsonl` | Every game event as one typed row (`domain/event`). |
| `jev.jsonl` | Jev fight requests and decisions. |
| `session.jsonl` | A link to the current Pi session file in `pi-sessions/`. |
| `tools.json` | Calls, status words, validation errors, repeat refusals and timings per tool. |
| `runs.jsonl` | One row per run when it ends. |
| `status.json` | Agent state, active run and last progress, written every second. |
| `snapshots/` | Files from `/snapshot`. |
| `workspace/` | The empty working directory of Pi. |

## Exit codes

| Code | Cause |
|---|---|
| 0 | Normal exit, or `--check` passed. |
| 2 | Bad flags, a bad or protected profile, or a held lock. |
| 3 | No Codex login, or the login expires in less than 10 minutes. |
````

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/prompt/harness-doc.test.ts && mise lint:docs && mise typecheck harness && mise lint packages/harness`
Expected: PASS (4 tests); `lint:docs` prints nothing and exits 0 (the doc has no `tmp/` path and no date, and `packages/harness/src/entry.ts`, `packages/harness/src/prompt/system-prompt.ts`, `packages/harness/src/prompt/guidelines.ts` and `packages/factory/src/main.ts` exist); tsc and biome exit 0.

If `commandNames()` finds a name that the doc does not have, add a row to the Commands table. Do not remove the test.

- [ ] **Step 5: Commit**

```bash
git add docs/harness.md packages/harness/src/prompt/harness-doc.test.ts
mise exec -- git commit -m "docs: Document how to run the Pi harness" -m "A human needs the flags, the Codex login rules, the stop keys and the screen in one place. The test fails when a flag, a command or a tool is added without a doc line."
```

---

### Task P6: README section and AGENTS.md commands

**Files:**
- Modify: `README.md` (a new `## Pi harness` section directly before `## Roadmap`, nothing else)
- Modify: `AGENTS.md` (two bullets in `## Commands`, directly after the `mise build` bullet, nothing else)
- Test: `mise lint:docs` and the command check in Steps 1 and 4

**Interfaces:**
- Consumes: `mise harness` (P4), `docs/harness.md` (P5), `mise eval` and `bun packages/harness/src/grader/cli.ts <launch|send|frame|watch|truth|final-truth|leak-check|validate|scenario>` (E7).
- Produces: nothing that code uses.

- [ ] **Step 1: Write the failing check**

```bash
rg -n '^## Pi harness$' README.md; echo "readme=$?"
rg -n '^- `mise harness' AGENTS.md; echo "agents-harness=$?"
rg -n '^- `mise eval' AGENTS.md; echo "agents-eval=$?"
mise tasks info eval
```

- [ ] **Step 2: Run it and see it fail**

Expected: `readme=1`, `agents-harness=1`, `agents-eval=1`. `mise tasks info eval` prints the E7 task (if it prints "no task", stop: E7 has not landed). Read its `Run:` and `usage` lines. Step 3's AGENTS line must match them.

- [ ] **Step 3: Write the text**

Add this section to `README.md` directly before `## Roadmap`:

````markdown
## Pi harness

The Pi harness is an interactive agent that plays one character. A model
(by default `openai-codex/gpt-6-luna`) acts through ten game tools, and
you steer it by typing in the same terminal. It needs a Codex login in
omp and a character profile, for example a throwaway soap account:

```
umask 077
bun packages/factory/src/main.ts soap create eversong10 > "$XDG_RUNTIME_DIR/char.json"
mise harness --profile "$XDG_RUNTIME_DIR/char.json"
```

Type `stop`, press `F9` or use `/stop` to halt everything. Flags,
credentials, commands and the screen are in
[docs/harness.md](docs/harness.md). Evals run the harness in Orca panes
and grade it on server truth with `mise eval`.
````

Add these two bullets to `AGENTS.md` in `## Commands`, directly after the `mise build` bullet:

```markdown
- `mise harness --profile <path> [flags]` — run the Pi harness
  (`bun packages/harness/src/entry.ts`), the interactive agent that plays
  one character; flags, credentials and commands are in `docs/harness.md`
- `mise eval <subcommand>` — the harness eval grader CLI
  (`bun packages/harness/src/grader/cli.ts`): `launch`, `send`, `frame`,
  `watch`, `truth`, `final-truth`, `leak-check`, `validate`, `scenario`;
  JSON on stdout, never a password
```

If `mise tasks info eval` in Step 2 showed a different command or other subcommands, write those instead.

- [ ] **Step 3b: Only if the coordinator gives P6 a line in `docs/harness.md` (Contract issue 7)**

Add this paragraph at the end of the "Run it" section of `docs/harness.md`:

```markdown
Evals run the harness in Orca terminal panes on throwaway soap accounts
and grade each run on server truth. The grader tools are `mise eval`
(`bun packages/harness/src/grader/cli.ts`).
```

- [ ] **Step 4: Run the checks and see them pass**

Run the Step 1 commands again, then `mise lint:docs && mise test packages/harness/src/prompt/harness-doc.test.ts`.
Expected: `readme=0`, `agents-harness=0`, `agents-eval=0`; `lint:docs` prints nothing and exits 0 (`packages/harness/src/entry.ts` and `packages/harness/src/grader/cli.ts` exist); the drift test still passes.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md
mise exec -- git commit -m "docs: Point README and AGENTS at the harness" -m "Readers and agents find the harness and the eval CLI from the two files they read first. The details stay in docs/harness.md."
```

(If Step 3b ran, also `git add docs/harness.md` before the commit.)

---

## Self-review

- Spec coverage: F.1 text (P1), per-tool guidance (P2), prompt on every request and the removed `<cwd>` block (P3; the forced prompt has no `<cwd>` section), `mise harness` (P4), how to run, flags, credentials, UI and commands (P5), README and AGENTS (P6). No CLI-visible change, so no `SKILL.md`, `help.ts` or `docs/manual.md` line.
- Placeholders: none. Every step has code or an exact command.
- Names: `PromptInit`, `buildSystemPrompt`, `ToolText`, `TOOL_TEXT`, `installPrompt` match contract 2.15. The only new file outside the contract is `harness-doc.test.ts` (Contract issue 6).
- Review Focus: each line has its test in P1, P3 or P5.
