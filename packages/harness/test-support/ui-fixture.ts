import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { NowSnapshot, SelfView, UnitView } from "#harness/contract/views";

const FG = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
] as const;

const BG = [
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
] as const;

const hex = (index: number) =>
  `#${(0x10_00_00 + index * 0x01_01_01).toString(16)}`;

export const WIDTHS = Array.from({ length: 191 }, (_, index) => index + 30);

export function testTheme(): Theme {
  const fg = Object.fromEntries(FG.map((name, index) => [name, hex(index)]));
  const bg = Object.fromEntries(BG.map((name) => [name, "#202020"]));
  return new Theme(
    fg as Record<(typeof FG)[number], string>,
    bg as Record<(typeof BG)[number], string>,
    "truecolor",
  );
}

export function plain(lines: readonly string[]): string[] {
  return lines.map((line) => stripTerminalSequences(line));
}

export function painted(
  theme: Theme,
  color: ThemeColor,
  line: string,
): boolean {
  return line.includes(theme.getFgAnsi(color));
}

export function widest(lines: readonly string[]): number {
  return Math.max(0, ...lines.map((line) => visibleWidth(line)));
}

export function unitFixture(over: Partial<UnitView> = {}): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: true,
    compass: "NE",
    distance: 4,
    entry: 15_366,
    guid: "f130003c0e000123",
    hp: 35,
    hpPct: 26,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name: "Springpaw Stalker",
    ref: "u9",
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: true,
    x: 8768,
    y: -6680,
    z: 72,
    ...over,
  };
}

export function selfFixture(over: Partial<SelfView> = {}): SelfView {
  return {
    className: "Priest",
    copper: 49_975,
    freeSlots: 11,
    guid: "1a2b",
    hp: 175,
    inCombat: true,
    level: 10,
    life: "alive",
    maxHp: 217,
    maxPower: 300,
    name: "Fgklibhlflc",
    pose: {
      ageMs: 200,
      facing: "NE",
      mapId: 530,
      serverFixAgeMs: 3000,
      source: "server",
      x: 8765,
      y: -6683,
      z: 72.7,
    },
    power: 212,
    powerKind: "mana",
    race: "Blood Elf",
    xpPct: 41,
    ...over,
  };
}

export function nowFixture(over: Partial<NowSnapshot> = {}): NowSnapshot {
  const target = unitFixture();
  return {
    at: 1_790_000_000_000,
    attackers: [
      { guid: target.guid, hitAgoMs: 2000, name: target.name, ref: target.ref },
    ],
    hpDelta5s: -12,
    nearest: { hostile: target },
    noProgress: undefined,
    place: {
      ageMs: 1000,
      area: "Fairbreeze Village",
      areaId: 3462,
      zone: "Eversong Woods",
      zoneId: 3430,
    },
    recovery: undefined,
    run: {
      elapsedMs: 9000,
      id: "r4",
      kind: "engage",
      label: "engage Springpaw Stalker u9",
      progress: "Springpaw Stalker 47/137",
    },
    self: selfFixture(),
    selfCast: { elapsedMs: 400, spell: "Smite", totalMs: 1500 },
    target,
    targetAuras: [
      {
        mine: true,
        name: "Shadow Word: Pain",
        remainingMs: 14_000,
        spellId: 589,
      },
    ],
    wake: true,
    ...over,
  };
}
