import { describe, expect, test } from "bun:test";
import { JevUnavailableError } from "@tuicraft/core";
import type { ToolResult } from "#harness/contract/result";
import {
  askHuman,
  coreErrorResult,
  emptySelf,
  formatContent,
  MAX_CONTENT_BYTES,
  MAX_CONTENT_LINES,
  nextCall,
  result,
} from "#harness/tools/define";

const plain = { danger: undefined, maxLines: MAX_CONTENT_LINES };

describe("result", () => {
  test("fills an empty body", () => {
    expect(result("DONE", { after: 1, detail: "ok." })).toEqual({
      after: 1,
      body: [],
      detail: "ok.",
      status: "DONE",
    });
  });
});

describe("formatContent", () => {
  test("puts the status word first, then the body", () => {
    const done = result("DONE", {
      after: 0,
      body: ["Target: none. Running: nothing."],
      detail: "Fgklibhlflc L10 Priest.",
    });
    expect(formatContent(done, plain)).toBe(
      "DONE Fgklibhlflc L10 Priest.\nTarget: none. Running: nothing.",
    );
  });

  test("writes the reason code after the status word", () => {
    const refused = result("REFUSED", {
      after: 0,
      detail: "the world is still loading.",
      next: "call look again in a few seconds.",
      reason: "not_ready",
    });
    expect(formatContent(refused, plain)).toBe(
      "REFUSED not_ready: the world is still loading.\nNext: call look again in a few seconds.",
    );
  });

  test("writes the run id for RUNNING", () => {
    const running = result("RUNNING", {
      after: 0,
      detail:
        "engage 1 of 3 kills, fighting Springpaw Stalker u9 (41%). You: HP 164/217, mana 61%, at 8813, -6691.",
      next: 'end your turn; a [game] message comes when r3 ends. Or stop(run: "r3").',
      reason: "yield",
      runId: "r3",
    });
    expect(formatContent(running, plain).split("\n")[0]).toStartWith(
      "RUNNING r3: engage 1 of 3 kills",
    );
  });

  test("puts the danger line before the Next line", () => {
    const failed = result("FAILED", {
      after: 0,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
    const danger =
      "Danger: Springpaw Stalker u9 is attacking you (hit you 3 s ago). You are at 41% HP.";
    expect(
      formatContent(failed, { danger, maxLines: MAX_CONTENT_LINES }).split(
        "\n",
      ),
    ).toEqual([
      "FAILED cancelled: the human stopped you. Start nothing new.",
      danger,
      "Next: end your turn and wait for the human.",
    ]);
  });

  test("cuts the body to fit and keeps line 1, danger and Next", () => {
    const body = Array.from({ length: 30 }, (_, i) => `row ${i + 1}`);
    const long = result("DONE", {
      after: 0,
      body,
      detail: "many.",
      next: "look()",
    });
    const lines = formatContent(long, {
      danger: "Danger: x.",
      maxLines: 12,
    }).split("\n");
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("DONE many.");
    expect(lines.at(-3)).toBe("+22 more; narrow the call.");
    expect(lines.at(-2)).toBe("Danger: x.");
    expect(lines.at(-1)).toBe("Next: look()");
  });

  test("the design stop example fits the limits", () => {
    const stop = result("DONE", {
      after: 0,
      detail:
        "stopped r4 (engage, 1 of 3 kills). Not moving, not attacking. HP 190/217.",
    });
    const text = formatContent(stop, {
      danger:
        "Danger: Springpaw Stalker u9 is still attacking you. You are at 88% HP.",
      maxLines: MAX_CONTENT_LINES,
    });
    expect(text.split("\n").length).toBeLessThanOrEqual(MAX_CONTENT_LINES);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });
});

describe("nextCall and askHuman", () => {
  test("quotes strings and keeps numbers and booleans bare, in the given order", () => {
    expect(nextCall("engage", { target: "u9" })).toBe('engage(target: "u9")');
    expect(
      nextCall("engage", {
        count: 3,
        loot: false,
        target: "Springpaw Stalker",
      }),
    ).toBe('engage(count: 3, loot: false, target: "Springpaw Stalker")');
    expect(nextCall("recover")).toBe("recover()");
  });

  test("askHuman quotes the question", () => {
    expect(askHuman("Which NPC?")).toBe('ask the human: "Which NPC?"');
  });
});

describe("coreErrorResult", () => {
  const cases: [
    unknown,
    Pick<ToolResult<number>, "detail" | "next" | "reason" | "status">,
  ][] = [
    [
      new Error("World socket is not connected"),
      {
        detail: "the game connection is down.",
        next: "ask the human to run /connect.",
        reason: "offline",
        status: "REFUSED",
      },
    ],
    [
      new Error("self_not_alive"),
      {
        detail: "you are dead.",
        next: "recover()",
        reason: "dead",
        status: "REFUSED",
      },
    ],
    [
      new Error("missing_jev_key"),
      {
        detail: "TYPESAFE_API_KEY is not set.",
        next: "ask the human to set it.",
        reason: "no_combat_helper",
        status: "REFUSED",
      },
    ],
    [
      new JevUnavailableError("missing_jev_key"),
      {
        detail: "TYPESAFE_API_KEY is not set.",
        next: "ask the human to set it.",
        reason: "no_combat_helper",
        status: "REFUSED",
      },
    ],
    [
      new JevUnavailableError("HTTP 503 server"),
      {
        detail: "the fight helper is not answering (HTTP 503 server).",
        next: 'ask the human: "The fight helper is not answering. What should I do?"',
        reason: "jev_unavailable",
        status: "FAILED",
      },
    ],
    [
      new Error("not_implemented"),
      {
        detail: "this part of the harness is not built yet.",
        next: 'ask the human: "This action is not built yet. What should I do instead?"',
        reason: "not_implemented",
        status: "FAILED",
      },
    ],
  ];

  for (const [error, expected] of cases) {
    test(`maps ${String(error)}`, () => {
      expect(coreErrorResult(error, 7)).toMatchObject({
        ...expected,
        after: 7,
        body: [],
      });
    });
  }

  test("maps <code>: <raw> to FAILED <code> with the core next step as body", () => {
    const mapped = coreErrorResult(
      new Error(
        "no_ground: pathfind_find_height failed (UNKNOWN_HEIGHT)\nstack line",
      ),
      0,
    );
    expect(mapped.status).toBe("FAILED");
    expect(mapped.reason).toBe("no_ground");
    expect(mapped.detail).toBe("pathfind_find_height failed (UNKNOWN_HEIGHT)");
    expect(mapped.next).toBe("look()");
  });

  test("maps anything else to FAILED error with the first line only", () => {
    const mapped = coreErrorResult(new Error("boom\n    at x (y.ts:1:1)"), 0);
    expect(formatContent(mapped, plain)).toBe(
      "FAILED error: boom\nNext: look()",
    );
  });
});

describe("empty views", () => {
  test("emptySelf has no pose and unknown life", () => {
    expect(emptySelf()).toMatchObject({
      life: "unknown",
      pose: undefined,
      powerKind: "none",
    });
  });
});
