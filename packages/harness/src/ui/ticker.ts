import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { RunView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  chrome,
  entryGlyph,
  entryTone,
  fit,
  padLeft,
  span,
} from "#harness/ui/draw";

export type TickerSource = {
  recent: (n: number) => GameLogEntry[];
  run: () => RunView | undefined;
  kills: () => number;
  xp: () => number;
  now: () => number;
};

export type TickerInit = {
  source: TickerSource;
  width: number;
  theme: Theme;
  now: number;
};

export const TICKER_ROWS = 6;

const EVENT_ROWS = TICKER_ROWS - 1;
const SCAN_ROWS = 200;

const HIDDEN: ReadonlySet<LogEvent> = new Set<LogEvent>([
  "agent/message",
  "agent/now",
  "entity/appear",
  "entity/disappear",
  "human/input",
  "run/progress",
  "session/wake_throttled",
  "snapshot/world",
  "tool/call",
  "tool/result",
  "tool/validation_error",
]);

const SMSG_EMOTE = 259;
const SMSG_TEXT_EMOTE = 261;
const EMOTE_OPCODES: ReadonlySet<unknown> = new Set([
  SMSG_EMOTE,
  SMSG_TEXT_EMOTE,
]);

function visible(entry: GameLogEntry): boolean {
  if (HIDDEN.has(entry.event)) return false;
  return !(
    entry.event === "notice/not_implemented" &&
    EMOTE_OPCODES.has(entry.data["opcode"])
  );
}

function runText(run: RunView | undefined, theme: Theme): string {
  const g = glyphs();
  if (!run) return theme.fg("muted", `${g.idle} no run`);
  const what = run.progress ?? run.label;
  return `${theme.fg("warning", g.runRunning)} ${run.id} ${what} ${theme.fg("muted", span(run.elapsedMs))}`;
}

function tallyText(source: TickerSource, theme: Theme): string {
  const g = glyphs();
  const kills = source.kills();
  const word = kills === 1 ? "kill" : "kills";
  return `${theme.fg("success", `${g.kill} ${kills}`)} ${word} ${theme.fg("success", `${g.xp} +${source.xp()}`)} xp`;
}

function headRow(source: TickerSource, theme: Theme): string {
  return `${runText(source.run(), theme)}${theme.fg("dim", ` ${chrome().rule} `)}${tallyText(source, theme)}`;
}

function eventRow(entry: GameLogEntry, theme: Theme, now: number): string {
  const tone = entryTone(entry);
  const age = theme.fg("dim", padLeft(span(now - entry.ts), 4));
  return `${age} ${theme.fg(tone, entryGlyph(entry))} ${theme.fg(tone, entry.text)}`;
}

export function tickerLines({
  source,
  width,
  theme,
  now,
}: TickerInit): string[] {
  const shown = source.recent(SCAN_ROWS).filter(visible);
  const events = shown
    .slice(-EVENT_ROWS)
    .map((entry) => eventRow(entry, theme, now));
  const padding = Array.from({ length: EVENT_ROWS - events.length }, () =>
    theme.fg("dim", `   ${chrome().empty}`),
  );
  return [headRow(source, theme), ...padding, ...events].map((line) =>
    fit(line, width),
  );
}

export function createTicker(
  source: TickerSource,
): (tui: TUI, theme: Theme) => Component {
  return (_tui, theme) => {
    let last: { key: string; lines: string[] } | undefined;
    return {
      invalidate: () => {
        last = undefined;
      },
      render: (width) => {
        const now = source.now();
        const run = source.run();
        const key = [
          width,
          Math.floor(now / 1000),
          source.recent(1)[0]?.seq,
          source.kills(),
          source.xp(),
          run?.id,
          run?.progress,
        ].join("|");
        if (last?.key !== key)
          last = { key, lines: tickerLines({ now, source, theme, width }) };
        return last.lines;
      },
    };
  };
}
