import { describe, expect, test } from "bun:test";
import type {
  EntryRenderer,
  MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import { renderEventCard, renderHumanLine } from "#harness/ui/cards";
import { hms } from "#harness/ui/draw";
import { nerd } from "#harness/ui/glyphs";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();
const at = new Date(2026, 8, 26, 19, 13, 2).getTime();

const whisper: GameLogEntry = {
  char: "Fgklibhlflc",
  class: "wake",
  data: { sender: "Kaelyn", text: "hey, what level are you?", type: "whisper" },
  domain: "chat",
  event: "chat/in",
  seq: 7,
  text: "Kaelyn whispers › hey, what level are you?",
  ts: at,
  v: 1,
};

const death: GameLogEntry = {
  ...whisper,
  data: {},
  domain: "life",
  event: "life/dead",
  seq: 8,
  text: "You died › Springpaw Stalker L7 · Next: recover()",
  ts: at + 1000,
};

const message = (
  details: WowEventDetails | undefined,
): Parameters<MessageRenderer<WowEventDetails>>[0] => ({
  content: "[game 0s] ...",
  customType: "wow-event",
  details,
  display: true,
  role: "custom",
  timestamp: at,
});

const human = (
  entry: GameLogEntry | undefined,
): Parameters<EntryRenderer<HumanLineDetails>>[0] => ({
  customType: "wow-human",
  data: entry ? { entry } : undefined,
  id: "e1",
  parentId: null,
  timestamp: "2026-09-26T19:13:02Z",
  type: "custom",
});

describe("renderEventCard", () => {
  test("one line per event: glyph, time, text", () => {
    const view = renderEventCard(
      message({ entries: [whisper, death], kind: "wake" }),
      { expanded: false, outputPad: 1 },
      theme,
    );
    const lines = plain(view?.render(120) ?? []);
    expect(lines).toEqual([
      ` ${nerd.whisper} 19:13:02 Kaelyn whispers › hey, what level are you?`,
      ` ${nerd.death} ${hms(at + 1000)} You died › Springpaw Stalker L7 · Next: recover() (ctrl+o)`,
    ]);
  });

  test("ctrl+o shows the typed rows", () => {
    const view = renderEventCard(
      message({ entries: [whisper], kind: "wake" }),
      { expanded: true, outputPad: 0 },
      theme,
    );
    const lines = plain(view?.render(120) ?? []);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("  │ sender      Kaelyn");
  });

  test("a death card is red and a passive digest is muted", () => {
    const wake = renderEventCard(
      message({ entries: [death], kind: "wake" }),
      { expanded: false, outputPad: 0 },
      theme,
    );
    expect(painted(theme, "error", wake?.render(120)[0] ?? "")).toBe(true);
    const passive = renderEventCard(
      message({ entries: [death], kind: "passive" }),
      { expanded: false, outputPad: 0 },
      theme,
    );
    expect(painted(theme, "muted", passive?.render(120)[0] ?? "")).toBe(true);
  });

  test("no details gives Pi's default box", () => {
    expect(
      renderEventCard(
        message(undefined),
        { expanded: false, outputPad: 0 },
        theme,
      ),
    ).toBeUndefined();
    expect(
      renderEventCard(
        message({ entries: [], kind: "wake" }),
        { expanded: false, outputPad: 0 },
        theme,
      ),
    ).toBeUndefined();
  });
});

describe("renderHumanLine", () => {
  test("draws one muted line that the model never sees", () => {
    const view = renderHumanLine(human(death), { expanded: false }, theme);
    const line = view?.render(120)[0] ?? "";
    expect(plain([line])[0]).toBe(
      ` ${nerd.death} ${hms(at + 1000)} You died › Springpaw Stalker L7 · Next: recover()`,
    );
    expect(painted(theme, "muted", line)).toBe(true);
  });

  test("an entry without data draws nothing", () => {
    expect(
      renderHumanLine(human(undefined), { expanded: false }, theme),
    ).toBeUndefined();
  });
});
