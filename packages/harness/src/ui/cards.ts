import type {
  EntryRenderer,
  MessageRenderer,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import {
  chrome,
  drawn,
  entryGlyph,
  entryTone,
  hms,
  padRight,
} from "#harness/ui/draw";

type CardInit = {
  entries: readonly GameLogEntry[];
  expanded: boolean;
  theme: Theme;
  indent: string;
  muted: boolean;
};

const DATA_ROWS = 8;
const VALUE_CHARS = 80;
const KEY_CELLS = 11;

function valueText(value: unknown): string {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  return text.length > VALUE_CHARS
    ? `${text.slice(0, VALUE_CHARS - 1)}${chrome().ellipsis}`
    : text;
}

function dataRows(entry: GameLogEntry, theme: Theme, indent: string): string[] {
  const rule = theme.fg("borderMuted", chrome().rule);
  const rows = Object.entries(entry.data).slice(0, DATA_ROWS);
  return rows.map(
    ([key, value]) =>
      `${indent}  ${rule} ${theme.fg("muted", padRight(key, KEY_CELLS))} ${valueText(value)}`,
  );
}

function entryLine(entry: GameLogEntry, init: CardInit): string {
  const { theme, indent } = init;
  const tone = init.muted ? "muted" : entryTone(entry);
  return `${indent}${theme.fg(tone, entryGlyph(entry))} ${theme.fg("dim", hms(entry.ts))} ${theme.fg(tone, entry.text)}`;
}

function cardLines(init: CardInit): string[] {
  const { entries, expanded, theme, indent } = init;
  const lines = entries.flatMap((entry) => [
    entryLine(entry, init),
    ...(expanded ? dataRows(entry, theme, indent) : []),
  ]);
  const hasData = entries.some((entry) => Object.keys(entry.data).length > 0);
  const hint = !expanded && hasData ? theme.fg("dim", " (ctrl+o)") : "";
  return lines.map((line, i) =>
    i === lines.length - 1 ? `${line}${hint}` : line,
  );
}

export const renderEventCard: MessageRenderer<WowEventDetails> = (
  message,
  options,
  theme,
) => {
  const details = message.details;
  if (!details || details.entries.length === 0) return;
  const init = {
    entries: details.entries,
    expanded: options.expanded,
    indent: " ".repeat(options.outputPad),
    muted: details.kind === "passive",
    theme,
  };
  return drawn(() => cardLines(init));
};

export const renderHumanLine: EntryRenderer<HumanLineDetails> = (
  entry,
  options,
  theme,
) => {
  const line = entry.data?.entry;
  if (!line) return;
  return drawn(() =>
    cardLines({
      entries: [line],
      expanded: options.expanded,
      indent: " ",
      muted: true,
      theme,
    }),
  );
};
