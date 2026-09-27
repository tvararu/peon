import { afterEach, describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { GameLogEntry } from "#harness/contract/log";
import { setGlyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  drawn,
  entryGlyph,
  entryTone,
  fit,
  healthTone,
  hms,
  money,
  padLeft,
  padRight,
  seconds,
  span,
} from "#harness/ui/draw";
import { ascii, nerd } from "#harness/ui/glyphs";
import { painted, plain, testTheme } from "#test-support/ui-fixture";

const theme = testTheme();

const entry = (init: Partial<GameLogEntry>): GameLogEntry => ({
  char: "Fgklibhlflc",
  class: "log",
  data: {},
  domain: "chat",
  event: "chat/in",
  seq: 1,
  text: "Kaelyn whispers › hey",
  ts: 0,
  v: 1,
  ...init,
});

describe("draw helpers", () => {
  afterEach(() => setGlyphs("nerd"));

  test("bar fills eighths and keeps its cell count", () => {
    const line = bar({
      cells: 10,
      max: 100,
      theme,
      tone: "success",
      value: 55,
    });
    expect(plain([line])[0]).toBe("█████▌····");
    expect(painted(theme, "success", line)).toBe(true);
    expect(
      visibleWidth(bar({ cells: 8, max: 0, theme, tone: "error", value: 3 })),
    ).toBe(8);
  });

  test("the ascii set draws bars with plain characters", () => {
    setGlyphs("ascii");
    expect(
      plain([bar({ cells: 4, max: 4, theme, tone: "success", value: 2 })])[0],
    ).toBe("##..");
  });

  test("money drops leading zero coins", () => {
    expect(plain([money(theme, 49_975)])[0]).toBe(
      `${nerd.gold}4 ${nerd.silver}99 ${nerd.copper}75`,
    );
    expect(plain([money(theme, 5)])[0]).toBe(`${nerd.copper}5`);
    expect(plain([money(theme, 0)])[0]).toBe(`${nerd.copper}0`);
  });

  test("healthTone splits at half and a quarter", () => {
    expect(healthTone(0.8)).toBe("success");
    expect(healthTone(0.4)).toBe("warning");
    expect(healthTone(0.1)).toBe("error");
  });

  test("text helpers count cells, not UTF-16 units", () => {
    expect(visibleWidth(padRight(`${nerd.sword} a`, 6))).toBe(6);
    expect(padLeft("7", 3)).toBe("  7");
    expect(visibleWidth(fit("abcdefgh", 5))).toBe(5);
  });

  test("time helpers", () => {
    expect(hms(new Date(2026, 8, 26, 19, 13, 2).getTime())).toBe("19:13:02");
    expect(span(12_400)).toBe("12s");
    expect(span(300_000)).toBe("5m");
    expect(seconds(1100)).toBe("1.1s");
  });

  test("argText reads strings and numbers and ignores the rest", () => {
    expect(argText({ count: 3, target: "u9" }, "target")).toBe("u9");
    expect(argText({ count: 3 }, "count")).toBe("3");
    expect(argText(undefined, "target")).toBeUndefined();
    expect(argText({ target: { nested: true } }, "target")).toBeUndefined();
  });

  test("entry style: a whisper wake gets the whisper glyph", () => {
    expect(entryGlyph(entry({ class: "wake" }))).toBe(nerd.whisper);
    expect(entryGlyph(entry({ class: "passive" }))).toBe(nerd.say);
    expect(entryGlyph(entry({ domain: "life", event: "life/dead" }))).toBe(
      nerd.death,
    );
    expect(
      entryTone(entry({ domain: "notice", event: "notice/not_implemented" })),
    ).toBe("dim");
    expect(entryTone(entry({ domain: "run", event: "run/started" }))).toBe(
      "muted",
    );
  });

  test("the glyph set follows setGlyphs", () => {
    setGlyphs("ascii");
    expect(entryGlyph(entry({ domain: "life", event: "life/dead" }))).toBe(
      ascii.death,
    );
  });

  test("drawn caches per width and cuts every line", () => {
    let calls = 0;
    const view = drawn(() => {
      calls += 1;
      return ["abcdefghij"];
    });
    expect(view.render(4)).toHaveLength(1);
    view.render(4);
    expect(calls).toBe(1);
    expect(visibleWidth(view.render(6)[0] ?? "")).toBe(6);
    expect(calls).toBe(2);
  });
});
