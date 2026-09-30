import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { GameLogEntry } from "#harness/contract/log";
import type { RunView } from "#harness/contract/views";
import { nerd } from "#harness/ui/glyphs";
import {
  createTicker,
  TICKER_ROWS,
  type TickerSource,
  tickerLines,
} from "#harness/ui/ticker";
import { createFakeTui } from "#test-support/pi-recorder";
import { painted, plain, testTheme, WIDTHS } from "#test-support/ui-fixture";

const theme = testTheme();
const now = 1_790_000_060_000;

const row = (seq: number, init: Partial<GameLogEntry>): GameLogEntry => ({
  char: "Fgklibhlflc",
  class: "passive",
  data: {},
  domain: "chat",
  event: "chat/in",
  seq,
  text: `row ${seq}`,
  ts: now - 10_000 + seq * 1000,
  v: 1,
  ...init,
});

const run: RunView = {
  elapsedMs: 9000,
  id: "r4",
  kind: "engage",
  label: "engage Springpaw Stalker u9",
  progress: "Springpaw Stalker L7 47/137 · dealt 90 · took 7",
};

const source = (
  rows: GameLogEntry[],
  active: RunView | undefined,
): TickerSource => ({
  kills: () => 1,
  now: () => now,
  recent: (n) => rows.slice(-n),
  run: () => active,
  xp: () => 84,
});

const entries = [
  row(1, { class: "wake", text: "Kaelyn whispers › hey, what level are you?" }),
  row(2, {
    class: "log",
    domain: "tool",
    event: "tool/call",
    text: "hidden tool call",
  }),
  row(3, {
    class: "log",
    domain: "combat",
    event: "combat/kill_credit",
    text: "Springpaw Stalker killed · +84 xp",
  }),
  row(4, {
    class: "log",
    domain: "notice",
    event: "notice/not_implemented",
    text: "SMSG_CAMERA_SHAKE is not handled",
  }),
];

describe("tickerLines", () => {
  test("row 1 is the live run and the session tally", () => {
    const [head] = plain(
      tickerLines({ now, source: source(entries, run), theme, width: 200 }),
    );
    expect(head).toBe(
      `${nerd.runRunning} r4 Springpaw Stalker L7 47/137 · dealt 90 · took 7 9s │ ${nerd.kill} 1 kill ${nerd.xp} +84 xp`,
    );
  });

  test("rows 2-6 hold the newest visible events, log-only ones too", () => {
    const lines = plain(
      tickerLines({ now, source: source(entries, run), theme, width: 200 }),
    );
    expect(lines.slice(1, 3)).toEqual(["   ·", "   ·"]);
    expect(lines[3]).toBe(
      `  9s ${nerd.whisper} Kaelyn whispers › hey, what level are you?`,
    );
    expect(lines[4]).toBe(
      `  7s ${nerd.kill} Springpaw Stalker killed · +84 xp`,
    );
    expect(lines[5]).toBe(
      `  6s ${nerd.warning} SMSG_CAMERA_SHAKE is not handled`,
    );
    expect(lines.join("\n")).not.toContain("hidden tool call");
  });

  test("not-implemented notices are grey", () => {
    const lines = tickerLines({
      now,
      source: source(entries, run),
      theme,
      width: 200,
    });
    expect(painted(theme, "dim", lines[5] ?? "")).toBe(true);
  });

  test("emote notices never reach the ticker", () => {
    const notice = (seq: number, opcode: number, label: string) =>
      row(seq, {
        class: "log",
        data: { label, opcode },
        domain: "notice",
        event: "notice/not_implemented",
        text: `[peon] ${label} is not yet implemented`,
      });
    const lines = tickerLines({
      now,
      source: source(
        [
          ...entries,
          notice(20, 259, "Emote animation"),
          notice(21, 261, "Text emote"),
        ],
        run,
      ),
      theme,
      width: 200,
    });
    const text = lines.join("\n");
    expect(text).not.toContain("Emote animation");
    expect(text).not.toContain("Text emote");
    expect(plain([lines[5] ?? ""]).join("")).toContain(
      "SMSG_CAMERA_SHAKE is not handled",
    );
  });

  test("no run shows an idle head", () => {
    expect(
      plain(
        tickerLines({ now, source: source([], undefined), theme, width: 80 }),
      )[0],
    ).toStartWith(`${nerd.idle} no run`);
  });

  test("always six rows that fit, at every width from 30 to 220", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      row(i + 1, { text: "x".repeat(300) }),
    );
    for (const width of WIDTHS) {
      const lines = tickerLines({
        now,
        source: source(many, run),
        theme,
        width,
      });
      expect(lines).toHaveLength(TICKER_ROWS);
      for (const line of lines)
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});

describe("createTicker", () => {
  test("keeps its lines within a second and redraws when a new row arrives", () => {
    const rows = [...entries];
    const component = createTicker(source(rows, run))(
      createFakeTui().tui,
      theme,
    );
    const before = component.render(120);
    expect(component.render(120)).toBe(before);
    rows.push(row(5, { text: "a new row" }));
    expect(plain(component.render(120))[5]).toContain("a new row");
  });

  test("shows one not-implemented line per opcode for the session", () => {
    const notice = (seq: number, opcode: number, label: string) =>
      row(seq, {
        class: "log",
        data: { label, opcode },
        domain: "notice",
        event: "notice/not_implemented",
        text: `[peon] ${label} #${seq} is not yet implemented`,
      });
    const rows = [notice(10, 592, "Spell damage"), row(11, { text: "hit" })];
    const component = createTicker(source(rows, run))(
      createFakeTui().tui,
      theme,
    );
    expect(plain(component.render(160)).join("\n")).toContain(
      "Spell damage #10",
    );
    rows.splice(0, rows.length, row(20, { text: "cast" }));
    rows.push(notice(21, 592, "Spell damage"), notice(22, 1135, "Achievement"));
    const text = plain(component.render(160)).join("\n");
    expect(text).not.toContain("Spell damage #21");
    expect(text).toContain("Achievement #22");
  });

  test("reads the time from the source clock, not the wall clock", () => {
    let at = now;
    const component = createTicker({ ...source(entries, run), now: () => at })(
      createFakeTui().tui,
      theme,
    );
    const before = plain(component.render(120));
    at += 60_000;
    expect(plain(component.render(120))).not.toEqual(before);
  });
});
