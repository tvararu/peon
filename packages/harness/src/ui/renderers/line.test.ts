import { describe, expect, test } from "bun:test";
import type { AfterMap } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { nerd } from "#harness/ui/glyphs";
import { collapse, detailsOf, headLine } from "#harness/ui/renderers/line";
import {
  open,
  renderCallLine,
  renderResultLines,
  toolResult,
} from "#test-support/render-fixture";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

const said: ToolResult<AfterMap["social"]> = {
  after: {
    action: "whisper",
    confirmed: true,
    systemLine: undefined,
    text: "level 10",
    to: "Kaelyn",
  },
  body: [],
  detail: "whispered Kaelyn.",
  evidence: [{ domain: "chat", event: "chat/out", seq: 41 }],
  status: "DONE",
};

describe("line family", () => {
  test("social call line names the action and the player", () => {
    expect(renderCallLine("social", { text: "level 10", to: "Kaelyn" })).toBe(
      `${nerd.whisper} social whisper → Kaelyn "level 10"`,
    );
    expect(renderCallLine("social", { text: "hi" })).toBe(
      `${nerd.say} social say "hi"`,
    );
  });

  test("collapsed social result is one green status line", () => {
    const lines = renderResultLines("social", said);
    expect(plain(lines)).toEqual([`${nerd.runDone} DONE whispered Kaelyn.`]);
    expect(painted(theme, "success", lines[0] ?? "")).toBe(true);
  });

  test("expanded social result adds the echo and evidence rows", () => {
    expect(
      plain(renderResultLines("social", said, { options: open })).slice(1),
    ).toEqual(["the server echo confirmed it", "#41 chat/out"]);
  });

  test("a refusal is red, shows its reason, danger and next lines", () => {
    const refused = {
      ...said,
      detail: "the human wrote a message.",
      next: "read it.",
      reason: "human_waiting",
      status: "REFUSED" as const,
    };
    const text =
      "REFUSED ...\nDanger: Springpaw Stalker u9 is attacking you. You are at 23% HP.";
    const lines = renderResultLines("social", refused, { text });
    expect(plain(lines)).toEqual([
      `${nerd.error} REFUSED human_waiting: the human wrote a message.`,
      `${nerd.warning} Danger: Springpaw Stalker u9 is attacking you. You are at 23% HP.`,
      "Next: read it.",
    ]);
    expect(painted(theme, "error", lines[0] ?? "")).toBe(true);
  });

  test("stop call and expanded result list the stopped runs", () => {
    expect(renderCallLine("stop", {})).toBe(
      `${nerd.runFailed} stop everything`,
    );
    const record = {
      args: {},
      awaited: false,
      endedAt: 2,
      id: "r3",
      kind: "engage" as const,
      progress: undefined,
      reason: "stopped_by_tool",
      startedAt: 1,
      status: "cancelled" as const,
      summary: undefined,
      toolCallId: undefined,
    };
    const stopped: ToolResult<AfterMap["stop"]> = {
      after: {
        attackers: [],
        self: {
          hp: 175,
          maxHp: 217,
          maxPower: 300,
          power: 212,
          powerKind: "mana",
        },
        stopped: [record],
      },
      body: [],
      detail: "stopped r3 (engage).",
      status: "DONE",
    };
    expect(
      plain(renderResultLines("stop", stopped, { options: open })).slice(1),
    ).toEqual(["r3 engage cancelled stopped_by_tool", "HP 175/217"]);
  });

  test("a running result shows its run id", () => {
    const running = { ...said, runId: "r4", status: "RUNNING" as const };
    expect(plain([headLine(theme, running)])[0]).toBe(
      `${nerd.runRunning} RUNNING r4: whispered Kaelyn.`,
    );
  });

  test("collapse keeps five rows and counts the rest", () => {
    const lines = collapse(theme, ["a", "b", "c", "d", "e", "f", "g"], false);
    expect(plain(lines)).toEqual([
      "a",
      "b",
      "c",
      "d",
      `${nerd.clock} +3 more (ctrl+o)`,
    ]);
    expect(collapse(theme, ["a", "b"], false)).toEqual(["a", "b"]);
  });

  test("detailsOf refuses the wrong tool so Pi falls back to the text", () => {
    expect(() => detailsOf(toolResult("social", said), "stop")).toThrow(
      "renderer for stop got social",
    );
  });
});
