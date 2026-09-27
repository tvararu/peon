import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { LookAfter } from "#harness/contract/details";
import type { PoseView, SelfView, UnitView } from "#harness/contract/views";
import type { ToolRenderers } from "#harness/tools/game-tool";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  COMPASS_GLYPH,
  chrome,
  FACING_GLYPH,
  glyph,
  healthTone,
  padLeft,
  padRight,
  RELATION_TONE,
} from "#harness/ui/draw";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitGlyph,
  unitLabel,
} from "#harness/ui/renderers/line";

type Cell = { col: number; row: number };
type MapInit = {
  theme: Theme;
  pose: PoseView;
  units: readonly UnitView[];
  target: string | undefined;
};

export const MAP_MIN_WIDTH = 112;
const MAP_COLS = 25;
const MAP_ROWS = 11;
const MAP_UNITS = 10;

function vitalsLine(theme: Theme, self: SelfView): string {
  const g = glyphs();
  const hp = bar({
    cells: 12,
    max: self.maxHp,
    theme,
    tone: healthTone(self.hp / Math.max(1, self.maxHp)),
    value: self.hp,
  });
  const power =
    self.powerKind === "none"
      ? ""
      : ` ${g.mana} ${bar({ cells: 12, max: self.maxPower, theme, tone: "mdLink", value: self.power })} ${self.power}/${self.maxPower}`;
  return `${theme.bold(self.name)} ${theme.fg("muted", `L${self.level} ${self.className}`)}  ${g.health} ${hp} ${self.hp}/${self.maxHp}${power}`;
}

function placeLine(theme: Theme, after: LookAfter): string {
  const g = glyphs();
  const { zone, area } = after.place;
  const pose = after.self.pose;
  const where = pose
    ? ` (${Math.round(pose.x)},${Math.round(pose.y)}) ${g[FACING_GLYPH[pose.facing]]}`
    : "";
  const unchanged =
    after.unchanged > 1
      ? theme.fg("dim", ` ${g.clock} unchanged ×${after.unchanged}`)
      : "";
  const name =
    [zone, area]
      .filter((part) => part !== undefined)
      .join(` ${chrome().sep} `) || "unknown place";
  return `${theme.fg("accent", g.mapPin)} ${name}${theme.fg("dim", where)}${unchanged}`;
}

function distanceText(unit: UnitView): string {
  if (unit.distance === undefined) return "";
  const arrow = unit.compass ? glyph(COMPASS_GLYPH[unit.compass]) : "";
  return `${Math.round(unit.distance)}y${arrow}`;
}

function nearLine(theme: Theme, after: LookAfter): string {
  const first = after.danger.attackers[0];
  if (first) {
    const more =
      after.danger.attackers.length > 1
        ? ` and ${after.danger.attackers.length - 1} more`
        : "";
    return theme.fg(
      "error",
      `${glyph("warning")} ${first.name} ${first.ref}${more} attacking · ${after.danger.hpPct}% HP`,
    );
  }
  const hostile = after.nearest.hostile;
  if (!hostile)
    return theme.fg("success", `${glyph("friendly")} no hostile in view`);
  return `${theme.fg("muted", "nearest hostile")} ${unitLabel(theme, hostile)} L${hostile.level} ${distanceText(hostile)}`;
}

function unitRow(theme: Theme, unit: UnitView): string {
  const tone = unit.alive ? RELATION_TONE[unit.relation] : "dim";
  const name = theme.fg(tone, `${unitGlyph(unit)} ${padRight(unit.name, 22)}`);
  const hp = `${bar({ cells: 8, max: unit.maxHp, theme, tone: healthTone(unit.hpPct / 100), value: unit.hp })}${padLeft(`${unit.hpPct}%`, 5)}`;
  const tags = unit.inView
    ? [
        unit.targetsMe ? theme.fg("error", `${glyph("target")} on you`) : "",
        unit.lootable ? theme.fg("warning", `${glyph("loot")} loot`) : "",
      ]
    : [theme.fg("dim", "out of view")];
  return `${padRight(unit.ref, 4)} ${name} ${padLeft(`L${unit.level}`, 3)} ${hp} ${padLeft(distanceText(unit), 5)} ${tags.filter(Boolean).join(" ")}`.trimEnd();
}

function mapRadius(units: readonly UnitView[]): number {
  const near = units.map((unit) => unit.distance ?? 0).slice(0, MAP_UNITS);
  return Math.max(10, Math.ceil(Math.max(0, ...near) / 5) * 5);
}

function mapCell(
  unit: UnitView,
  pose: PoseView,
  radius: number,
): Cell | undefined {
  if (unit.x === undefined || unit.y === undefined) return;
  const col = Math.round(
    (MAP_COLS - 1) / 2 - ((unit.y - pose.y) / radius) * (MAP_COLS / 2),
  );
  const row = Math.round(
    (MAP_ROWS - 1) / 2 - ((unit.x - pose.x) / radius) * (MAP_ROWS / 2),
  );
  return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS
    ? { col, row }
    : undefined;
}

function put(grid: string[][], cell: Cell, text: string): void {
  const line = grid[cell.row];
  if (line) line[cell.col] = text;
}

function miniMap({ theme, pose, units, target }: MapInit): string[] {
  const c = chrome();
  const radius = mapRadius(units);
  const grid = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => " "),
  );
  const centre = { col: (MAP_COLS - 1) / 2, row: (MAP_ROWS - 1) / 2 };
  for (const unit of [...units.slice(0, MAP_UNITS)].reverse()) {
    const cell = mapCell(unit, pose, radius);
    const tone = unit.ref === target ? "accent" : RELATION_TONE[unit.relation];
    if (cell) put(grid, cell, theme.fg(tone, unitGlyph(unit)));
  }
  put(grid, centre, theme.fg("accent", glyph(FACING_GLYPH[pose.facing])));
  const [tl, tr, bl, br] = c.corners;
  const label = ` ${glyph("rangeRing")} ${radius}y `;
  const top = theme.fg("borderMuted", `${tl}${c.hline.repeat(MAP_COLS)}${tr}`);
  const bottom = theme.fg(
    "borderMuted",
    `${bl}${label}${c.hline.repeat(Math.max(0, MAP_COLS - visibleWidth(label)))}${br}`,
  );
  const side = theme.fg("borderMuted", c.rule);
  return [
    top,
    ...grid.map((cells) => `${side}${cells.join("")}${side}`),
    bottom,
  ];
}

function besideMap(
  left: readonly string[],
  map: readonly string[],
  width: number,
): string[] {
  const leftWidth = width - MAP_COLS - 4;
  const height = Math.max(left.length, map.length);
  return Array.from(
    { length: height },
    (_, i) => `${padRight(left[i] ?? "", leftWidth)}  ${map[i] ?? ""}`,
  );
}

function lookBody({
  after,
  theme,
  expanded,
  width,
}: BodyInit<LookAfter>): string[] {
  const head = [
    vitalsLine(theme, after.self),
    placeLine(theme, after),
    nearLine(theme, after),
  ];
  if (!expanded) return head;
  const rows = after.rows.map((unit) => unitRow(theme, unit));
  const count = theme.fg(
    "dim",
    `${after.matched} of ${after.seen} units match ${after.filter}`,
  );
  const left = [...head, ...rows, count];
  const pose = after.self.pose;
  if (!pose || width < MAP_MIN_WIDTH) return left;
  return besideMap(
    left,
    miniMap({ pose, target: after.target?.ref, theme, units: after.rows }),
    width,
  );
}

function lookCall(args: unknown, theme: Theme): string {
  const name = argText(args, "name");
  const within = argText(args, "within");
  const parts = [
    argText(args, "find") ?? "any",
    name && `"${name}"`,
    within && `≤${within}y`,
  ];
  return callLine({ icon: "target", parts, theme, verb: "look" });
}

export const lookRenderers: ToolRenderers<"look", LookAfter> = {
  renderCall: callRenderer(lookCall),
  renderResult: resultRenderer("look", lookBody),
};
