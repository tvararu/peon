import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { ChatType, type FactionRelation } from "@peon/core";
import type { Domain, GameLogEntry, LogEvent } from "#harness/contract/log";
import type { ToolStatus } from "#harness/contract/result";
import type { Compass } from "#harness/contract/views";
import { glyphSetName, glyphs } from "#harness/ui/context";
import type { GlyphName } from "#harness/ui/glyphs";

export type Chrome = {
  eighths: readonly string[];
  full: string;
  empty: string;
  ellipsis: string;
  sep: string;
  rule: string;
  hline: string;
  corners: readonly [string, string, string, string];
  ring: string;
};

const BOX: Chrome = {
  corners: ["┌", "┐", "└", "┘"],
  eighths: ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"],
  ellipsis: "…",
  empty: "·",
  full: "█",
  hline: "─",
  ring: "·",
  rule: "│",
  sep: "·",
};

const PLAIN: Chrome = {
  corners: ["+", "+", "+", "+"],
  eighths: ["", "", "", "", ":", ":", ":", ":"],
  ellipsis: "~",
  empty: ".",
  full: "#",
  hline: "-",
  ring: ".",
  rule: "|",
  sep: "|",
};

export const STATUS_TONE: Readonly<Record<ToolStatus, ThemeColor>> = {
  DONE: "success",
  FAILED: "error",
  PARTLY: "warning",
  REFUSED: "error",
  RUNNING: "warning",
  UNCONFIRMED: "warning",
};

export const STATUS_GLYPH: Readonly<Record<ToolStatus, GlyphName>> = {
  DONE: "runDone",
  FAILED: "runFailed",
  PARTLY: "warning",
  REFUSED: "error",
  RUNNING: "runRunning",
  UNCONFIRMED: "warning",
};

export const RELATION_TONE: Readonly<Record<FactionRelation, ThemeColor>> = {
  friendly: "success",
  hostile: "error",
  neutral: "warning",
  unknown: "muted",
};

export const RELATION_GLYPH: Readonly<Record<FactionRelation, GlyphName>> = {
  friendly: "friendly",
  hostile: "hostile",
  neutral: "neutral",
  unknown: "neutral",
};

export const COMPASS_GLYPH: Readonly<Record<Compass, GlyphName>> = {
  E: "compassE",
  N: "compassN",
  NE: "compassNE",
  NW: "compassNW",
  S: "compassS",
  SE: "compassSE",
  SW: "compassSW",
  W: "compassW",
};

export const FACING_GLYPH: Readonly<Record<Compass, GlyphName>> = {
  E: "facingE",
  N: "facingN",
  NE: "facingNE",
  NW: "facingNW",
  S: "facingS",
  SE: "facingSE",
  SW: "facingSW",
  W: "facingW",
};

export const DOMAIN_GLYPH: Readonly<Record<Domain, GlyphName>> = {
  agent: "system",
  aura: "buff",
  chat: "say",
  combat: "combat",
  control: "route",
  entity: "neutral",
  fight: "sword",
  group: "party",
  human: "self",
  life: "death",
  loot: "loot",
  money: "gold",
  nav: "route",
  notice: "warning",
  packet: "error",
  quest: "questLog",
  run: "runRunning",
  session: "system",
  snapshot: "system",
  social: "party",
  tool: "system",
  trainer: "trainer",
  vendor: "vendor",
  xp: "xp",
};

const EVENT_GLYPH: Partial<Record<LogEvent, GlyphName>> = {
  "agent/stuck": "warning",
  "aura/fade": "debuff",
  "combat/attacked": "damageIn",
  "combat/cast": "cast",
  "combat/kill_credit": "kill",
  "life/alive": "health",
  "life/low_health": "health",
  "life/released": "ghost",
  "life/resurrect_offer": "spiritHealer",
  "nav/refused": "warning",
  "quest/completed": "questComplete",
  "quest/rewarded": "questDone",
  "run/cancelled": "runFailed",
  "run/ended": "runDone",
  "social/duel_request": "sword",
  "xp/level_up": "levelUp",
};

const EVENT_TONE: Partial<Record<LogEvent, ThemeColor>> = {
  "agent/stuck": "warning",
  "chat/in": "accent",
  "combat/attacked": "error",
  "combat/kill_credit": "success",
  "control/server_correction": "warning",
  "life/dead": "error",
  "life/low_health": "error",
  "loot/item": "success",
  "nav/refused": "warning",
  "notice/not_implemented": "dim",
  "packet/error": "error",
  "quest/completed": "success",
  "run/cancelled": "warning",
  "session/lost": "error",
  "xp/level_up": "success",
};

const QUALITY_TONE: readonly ThemeColor[] = [
  "dim",
  "text",
  "success",
  "mdLink",
  "accent",
  "warning",
  "warning",
  "accent",
];

export function chrome(): Chrome {
  return glyphSetName() === "ascii" ? PLAIN : BOX;
}

export function glyph(name: GlyphName): string {
  return glyphs()[name];
}

const CHAT_GLYPH: ReadonlyMap<unknown, GlyphName> = new Map([
  [ChatType.SYSTEM, "system"],
  [ChatType.BG_SYSTEM_NEUTRAL, "system"],
  [ChatType.BG_SYSTEM_ALLIANCE, "system"],
  [ChatType.BG_SYSTEM_HORDE, "system"],
  [ChatType.WHISPER, "whisper"],
  [ChatType.WHISPER_FOREIGN, "whisper"],
  [ChatType.WHISPER_INFORM, "whisper"],
  [ChatType.MONSTER_WHISPER, "whisper"],
  [ChatType.RAID_BOSS_WHISPER, "whisper"],
  [ChatType.PARTY, "partyChat"],
  [ChatType.PARTY_LEADER, "partyChat"],
  [ChatType.RAID, "partyChat"],
  [ChatType.RAID_LEADER, "partyChat"],
  [ChatType.RAID_WARNING, "partyChat"],
  [ChatType.GUILD, "guild"],
  [ChatType.OFFICER, "guild"],
]);

function chatGlyph(entry: GameLogEntry): GlyphName | undefined {
  if (entry.domain !== "chat") return;
  const byType = CHAT_GLYPH.get(entry.data["type"]);
  if (byType) return byType;
  return entry.event === "chat/in" && entry.class === "wake"
    ? "whisper"
    : undefined;
}

export function entryGlyph(entry: GameLogEntry): string {
  return glyph(
    chatGlyph(entry) ?? EVENT_GLYPH[entry.event] ?? DOMAIN_GLYPH[entry.domain],
  );
}

export function entryTone(entry: GameLogEntry): ThemeColor {
  return EVENT_TONE[entry.event] ?? (entry.class === "log" ? "muted" : "text");
}

export function qualityTone(quality: number | null): ThemeColor {
  return QUALITY_TONE[quality ?? 1] ?? "text";
}

export function healthTone(part: number): ThemeColor {
  if (part > 0.5) return "success";
  if (part > 0.25) return "warning";
  return "error";
}

export function share(value: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
}

export type BarInit = {
  theme: Theme;
  value: number;
  max: number;
  cells: number;
  tone: ThemeColor;
};

export function bar({ theme, value, max, cells, tone }: BarInit): string {
  const c = chrome();
  const eighths = Math.round(share(value, max) * cells * 8);
  const full = Math.floor(eighths / 8);
  const part = c.eighths[eighths % 8] ?? "";
  const empty = Math.max(0, cells - full - (part ? 1 : 0));
  return (
    theme.fg(tone, c.full.repeat(full) + part) +
    theme.fg("borderMuted", c.empty.repeat(empty))
  );
}

export function money(theme: Theme, copper: number): string {
  const g = glyphs();
  const coins = [
    { count: Math.floor(copper / 10_000), glyph: g.gold, tone: "warning" },
    { count: Math.floor(copper / 100) % 100, glyph: g.silver, tone: "muted" },
    { count: copper % 100, glyph: g.copper, tone: "error" },
  ] as const;
  const first = coins.findIndex((coin) => coin.count > 0);
  const shown = coins.slice(first < 0 ? 2 : first);
  return shown
    .map((coin) => `${theme.fg(coin.tone, coin.glyph)}${coin.count}`)
    .join(" ");
}

export function fit(line: string, width: number): string {
  if (width > 0 && visibleWidth(line) <= width) return line;
  return truncateToWidth(line, width, chrome().ellipsis);
}

export function padRight(text: string, width: number): string {
  return truncateToWidth(text, width, chrome().ellipsis, true);
}

export function padLeft(text: string, width: number): string {
  const cut = fit(text, width);
  return `${" ".repeat(Math.max(0, width - Bun.stringWidth(cut)))}${cut}`;
}

export function hms(at: number): string {
  const d = new Date(at);
  const parts = [d.getHours(), d.getMinutes(), d.getSeconds()];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

export function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : span(ms);
}

export function argText(args: unknown, key: string): string | undefined {
  const value: unknown =
    typeof args === "object" && args !== null
      ? Reflect.get(args, key)
      : undefined;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return typeof value === "string" ? value : undefined;
}

export function drawn(draw: (width: number) => string[]): Component {
  let cache: { width: number; lines: string[] } | undefined;
  return {
    invalidate: () => {
      cache = undefined;
    },
    render: (width) => {
      if (cache?.width !== width)
        cache = { lines: draw(width).map((line) => fit(line, width)), width };
      return cache.lines;
    },
  };
}
