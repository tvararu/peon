import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import type { ConnectionState } from "#harness/contract/config";
import type {
  NowSnapshot,
  PowerKind,
  SelfView,
  UnitView,
} from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  bar,
  COMPASS_GLYPH,
  FACING_GLYPH,
  fit,
  glyph,
  healthTone,
  chrome as look,
  money,
  RELATION_GLYPH,
  RELATION_TONE,
  seconds,
  span,
} from "#harness/ui/draw";
import type { GlyphName, GlyphSetName } from "#harness/ui/glyphs";

export type FooterChrome = {
  model: string;
  thinking: string;
  contextPct: number | undefined;
  wake: boolean;
  glyphSet: GlyphSetName;
  logRows: number;
  unreadWhispers: number;
  missing: ("jev" | "nav" | "factions" | "spells")[];
  connection: ConnectionState;
};

export type FooterSource = {
  snapshot: () => NowSnapshot | undefined;
  chrome: () => FooterChrome;
};

export type FooterFactory = (tui: TUI, theme: Theme) => Component;

export const FOOTER_ROWS = 4;

type Segment = { variants: string[]; drop: number };
type Row = { snapshot: NowSnapshot; theme: Theme };
type MeterInit = { theme: Theme; icon: string; value: number; max: number };
type LinesInit = {
  snapshot: NowSnapshot | undefined;
  chrome: FooterChrome;
  width: number;
  theme: Theme;
};

const GAP = "  ";

const POWER_GLYPH: Readonly<Record<Exclude<PowerKind, "none">, GlyphName>> = {
  energy: "energy",
  focus: "energy",
  mana: "mana",
  rage: "rage",
  runic_power: "spell",
};

const sep = () => look().sep;

function joined(segments: readonly Segment[], pick: readonly number[]): string {
  const parts = segments.map(
    (segment, i) => segment.variants[pick[i] ?? 0] ?? "",
  );
  return parts.filter((part) => part.length > 0).join(GAP);
}

function nextToShrink(
  segments: readonly Segment[],
  pick: readonly number[],
): number | undefined {
  let best: number | undefined;
  for (const [i, segment] of segments.entries()) {
    const room = (pick[i] ?? 0) < segment.variants.length - 1;
    if (
      room &&
      (best === undefined || segment.drop >= (segments[best]?.drop ?? 0))
    )
      best = i;
  }
  return best;
}

function fitSegments(segments: readonly Segment[], width: number): string {
  const pick = segments.map(() => 0);
  let line = joined(segments, pick);
  let next = nextToShrink(segments, pick);
  while (visibleWidth(line) > width && next !== undefined) {
    pick[next] = (pick[next] ?? 0) + 1;
    line = joined(segments, pick);
    next = nextToShrink(segments, pick);
  }
  return fit(line, width);
}

function meter({ theme, icon, value, max }: MeterInit): string[] {
  const tone = healthTone(max > 0 ? value / max : 0);
  const pct = `${max > 0 ? Math.round((100 * value) / max) : 0}%`;
  const draw = (cells: number, label: string) =>
    `${icon}${bar({ cells, max, theme, tone, value })}${label}`;
  return [
    draw(16, `${value}/${max}`),
    draw(10, `${value}/${max}`),
    draw(6, pct),
    `${icon}${pct}`,
  ];
}

function nameSegment(self: SelfView, theme: Theme): Segment {
  const g = glyphs();
  const full = `${g.self} ${theme.bold(self.name)} ${theme.fg("muted", `${self.level} ${self.className}`)}`;
  return {
    drop: 1,
    variants: [full, `${g.self} ${self.name} ${self.level}`, self.name],
  };
}

function vitalSegments(self: SelfView, theme: Theme): Segment[] {
  const g = glyphs();
  if (self.life === "dead" || self.life === "ghost") {
    const word = self.life === "ghost" ? `${g.ghost} GHOST` : `${g.death} DEAD`;
    return [{ drop: 0, variants: [theme.fg("error", word)] }];
  }
  const health = {
    drop: 2,
    variants: meter({ icon: g.health, max: self.maxHp, theme, value: self.hp }),
  };
  const points: Segment[] = self.comboPoints
    ? [{ drop: 3, variants: [theme.fg("warning", `CP ${self.comboPoints}`)] }]
    : [];
  if (self.powerKind === "none") return [health, ...points];
  const icon = g[POWER_GLYPH[self.powerKind]];
  return [
    health,
    {
      drop: 2,
      variants: meter({ icon, max: self.maxPower, theme, value: self.power }),
    },
    ...points,
  ];
}

function xpSegment(self: SelfView, theme: Theme): Segment {
  if (self.xpPct === undefined) return { drop: 5, variants: [""] };
  const pct = Math.round(self.xpPct);
  const icon = glyph("xp");
  const barText = bar({
    cells: 10,
    max: 100,
    theme,
    tone: "accent",
    value: pct,
  });
  return {
    drop: 5,
    variants: [`${icon}${barText}${pct}%`, `${icon}${pct}%`, ""],
  };
}

function combatSegment(self: SelfView, theme: Theme): Segment {
  const g = glyphs();
  if (self.inCombat)
    return {
      drop: 3,
      variants: [
        theme.fg("error", `${g.combat} COMBAT`),
        theme.fg("error", g.combat),
      ],
    };
  return { drop: 3, variants: [theme.fg("dim", `${g.idle} idle`), ""] };
}

function selfRow({ snapshot, theme }: Row, width: number): string {
  const { self } = snapshot;
  const segments = [
    nameSegment(self, theme),
    ...vitalSegments(self, theme),
    xpSegment(self, theme),
    combatSegment(self, theme),
  ];
  return fitSegments(segments, width);
}

function unitHead(unit: UnitView, theme: Theme): Segment {
  const tone = RELATION_TONE[unit.relation];
  const mark = theme.fg(tone, glyph(RELATION_GLYPH[unit.relation]));
  const name = theme.fg(tone, unit.name);
  return {
    drop: 1,
    variants: [
      `${mark} ${name} ${theme.fg("muted", String(unit.level))}`,
      `${mark} ${name}`,
    ],
  };
}

function liveTarget(snapshot: NowSnapshot): UnitView | undefined {
  const unit = snapshot.target;
  return unit?.alive && unit.maxHp > 0 ? unit : undefined;
}

function auraSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const aura = liveTarget(snapshot)
    ? snapshot.targetAuras.find((a) => a.mine)
    : undefined;
  if (!aura) return { drop: 6, variants: [""] };
  const left =
    aura.remainingMs === undefined ? "" : ` ${span(aura.remainingMs)}`;
  return {
    drop: 6,
    variants: [
      `${theme.fg("accent", glyph("debuff"))} ${aura.name}${left}`,
      "",
    ],
  };
}

function castSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const cast = snapshot.selfCast;
  if (!cast) return { drop: 4, variants: [""] };
  const icon = theme.fg("warning", glyph("cast"));
  const left = seconds(Math.max(0, cast.totalMs - cast.elapsedMs));
  const barText = bar({
    cells: 8,
    max: cast.totalMs,
    theme,
    tone: "warning",
    value: cast.elapsedMs,
  });
  return {
    drop: 4,
    variants: [
      `${icon} ${cast.spell} ${barText}${left}`,
      `${icon} ${left}`,
      "",
    ],
  };
}

function targetSegments(snapshot: NowSnapshot, theme: Theme): Segment[] {
  const g = glyphs();
  const unit = liveTarget(snapshot);
  if (!unit)
    return [
      {
        drop: 1,
        variants: [
          theme.fg("dim", `${g.target} no target`),
          theme.fg("dim", g.target),
        ],
      },
    ];
  const hp = {
    drop: 2,
    variants: meter({ icon: "", max: unit.maxHp, theme, value: unit.hp }),
  };
  const onYou = unit.targetsMe
    ? [theme.fg("error", `${g.damageIn} on you`), theme.fg("error", g.damageIn)]
    : [""];
  return [unitHead(unit, theme), hp, { drop: 3, variants: onYou }];
}

function healerText(unit: UnitView): string {
  const g = glyphs();
  const dist =
    unit.distance === undefined ? "" : ` ${Math.round(unit.distance)}y`;
  const where = unit.compass ? ` ${g[COMPASS_GLYPH[unit.compass]]}` : "";
  return `${g.spiritHealer} ${unit.ref}${dist}${where}`;
}

function reclaimText(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms <= 0) return "reclaim ready";
  return `reclaim in ${glyphs().clock} ${seconds(ms)}`;
}

function recoverySegments(snapshot: NowSnapshot): Segment[] {
  const g = glyphs();
  const r = snapshot.recovery;
  if (!r) return [];
  const where = r.corpseCompass ? ` ${g[COMPASS_GLYPH[r.corpseCompass]]}` : "";
  const corpse =
    r.corpseYd === undefined
      ? ""
      : `${g.corpse} ${r.corpseYd.toFixed(1)}y${where}`;
  const reclaim = reclaimText(r.reclaimInMs);
  const healer = r.spiritHealer ? healerText(r.spiritHealer) : "";
  return [
    { drop: 2, variants: [corpse, ""] },
    { drop: 3, variants: [reclaim, ""] },
    { drop: 4, variants: [healer, ""] },
  ];
}

function targetRow({ snapshot, theme }: Row, width: number): string {
  const dead = snapshot.self.life === "dead" || snapshot.self.life === "ghost";
  const left = dead
    ? recoverySegments(snapshot)
    : targetSegments(snapshot, theme);
  return fitSegments(
    [...left, auraSegment(snapshot, theme), castSegment(snapshot, theme)],
    width,
  );
}

function placeSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const { zone, area } = snapshot.place;
  const pin = theme.fg("accent", glyph("mapPin"));
  const name =
    [zone, area].filter((part) => part !== undefined).join(` ${sep()} `) ||
    "unknown place";
  return {
    drop: 2,
    variants: [`${pin} ${name}`, `${pin} ${area ?? zone ?? "?"}`],
  };
}

function poseSegment(snapshot: NowSnapshot, theme: Theme): Segment {
  const pose = snapshot.self.pose;
  if (!pose) return { drop: 4, variants: [theme.fg("dim", "no pose"), ""] };
  const coords = `${Math.round(pose.x)},${Math.round(pose.y)} ${glyph(FACING_GLYPH[pose.facing])}`;
  const fix =
    pose.serverFixAgeMs === undefined
      ? "no server fix"
      : `server ${span(pose.serverFixAgeMs)}`;
  return {
    drop: 4,
    variants: [`${coords} ${theme.fg("dim", fix)}`, coords, ""],
  };
}

function statusSegments(snapshot: NowSnapshot, theme: Theme): Segment[] {
  const g = glyphs();
  const count = snapshot.attackers.length;
  const attackers =
    count > 0
      ? [
          theme.fg("error", `${g.hostile} ${count} attacking`),
          theme.fg("error", `${g.hostile}${count}`),
        ]
      : [""];
  const run = snapshot.run;
  const runText = run
    ? [
        `${g.runRunning} ${run.id} ${run.kind} ${span(run.elapsedMs)}`,
        `${g.runRunning} ${run.id}`,
      ]
    : [""];
  const coins =
    snapshot.self.copper === undefined
      ? [""]
      : [money(theme, snapshot.self.copper), ""];
  return [
    { drop: 5, variants: coins },
    { drop: 1, variants: attackers },
    { drop: 1, variants: runText },
  ];
}

function placeRow({ snapshot, theme }: Row, width: number): string {
  return fitSegments(
    [
      placeSegment(snapshot, theme),
      poseSegment(snapshot, theme),
      ...statusSegments(snapshot, theme),
    ],
    width,
  );
}

function chromeRow(chrome: FooterChrome, theme: Theme, width: number): string {
  const g = glyphs();
  const ctx =
    chrome.contextPct === undefined
      ? undefined
      : `ctx ${Math.round(chrome.contextPct)}%`;
  const unread =
    chrome.unreadWhispers > 0
      ? theme.fg("accent", `${g.whisper} ${chrome.unreadWhispers} unread`)
      : undefined;
  const missing = chrome.missing.map((name) => theme.fg("error", `no-${name}`));
  const link =
    chrome.connection === "online"
      ? undefined
      : theme.fg("warning", chrome.connection);
  const wake = `wake:${chrome.wake ? "on" : "off"}`;
  const parts = [
    link,
    ...missing,
    unread,
    chrome.model,
    chrome.thinking,
    ctx,
    wake,
    `glyphs:${chrome.glyphSet}`,
    `log ${chrome.logRows} rows`,
  ];
  const text = parts
    .filter((part) => part !== undefined)
    .join(theme.fg("dim", ` ${sep()} `));
  return fit(text, width);
}

export function footerLines({
  snapshot,
  chrome,
  width,
  theme,
}: LinesInit): string[] {
  const last = chromeRow(chrome, theme, width);
  if (!snapshot)
    return [
      fit(theme.fg("dim", `${glyph("idle")} waiting for the world…`), width),
      "",
      "",
      last,
    ];
  const row = { snapshot, theme };
  return [
    selfRow(row, width),
    targetRow(row, width),
    placeRow(row, width),
    last,
  ];
}

export function createFooter(source: FooterSource): FooterFactory {
  return (_tui, theme) => {
    let last:
      | { key: string; snapshot: NowSnapshot | undefined; lines: string[] }
      | undefined;
    return {
      invalidate: () => {
        last = undefined;
      },
      render: (width) => {
        const snapshot = source.snapshot();
        const chrome = source.chrome();
        const key = `${width}|${JSON.stringify(chrome)}`;
        if (last?.key !== key || last.snapshot !== snapshot)
          last = {
            key,
            lines: footerLines({ chrome, snapshot, theme, width }),
            snapshot,
          };
        return last.lines;
      },
    };
  };
}
