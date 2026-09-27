import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type {
  EngageAfter,
  JevDecisionView,
  LegView,
  TravelAfter,
  TravelGoalView,
} from "#harness/contract/details";
import type { CastView, UnitView, VitalsView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  bar,
  COMPASS_GLYPH,
  chrome,
  glyph,
  healthTone,
  money,
  seconds,
  span,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import {
  type BodyInit,
  callLine,
  callRenderer,
  resultRenderer,
  unitLabel,
} from "#harness/ui/renderers/line";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

const STRIP_CELLS = 40;

const DECISION: Readonly<
  Record<JevDecisionView["kind"], { icon: GlyphName; tone: ThemeColor }>
> = {
  attack: { icon: "sword", tone: "error" },
  face: { icon: "target", tone: "muted" },
  item: { icon: "item", tone: "success" },
  move: { icon: "compassN", tone: "mdLink" },
  spell: { icon: "spell", tone: "accent" },
  wait: { icon: "idle", tone: "dim" },
};

const LEG_TONE: Readonly<Record<LegView["status"], ThemeColor>> = {
  arrived: "success",
  cancelled: "warning",
  failed: "error",
  interrupted: "warning",
  refused: "error",
};

function yards(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}y`;
}

function goalText(goal: TravelGoalView): string {
  switch (goal.kind) {
    case "unit":
      return `${goal.name} ${goal.ref}`;
    case "point":
      return `(${Math.round(goal.x)}, ${Math.round(goal.y)})`;
    case "explore":
      return goal.direction ? `explore ${goal.direction}` : "explore";
    case "unstick":
      return "unstick";
    default:
      return "corpse";
  }
}

function vitalsRow(theme: Theme, vitals: VitalsView): string {
  const g = glyphs();
  const hp = bar({
    cells: 12,
    max: vitals.maxHp,
    theme,
    tone: healthTone(vitals.hp / Math.max(1, vitals.maxHp)),
    value: vitals.hp,
  });
  const power =
    vitals.powerKind === "none"
      ? ""
      : `  ${g.mana} ${bar({ cells: 12, max: vitals.maxPower, theme, tone: "mdLink", value: vitals.power })} ${vitals.power}/${vitals.maxPower}`;
  return `${theme.fg("accent", g.self)} ${g.health} ${hp} ${vitals.hp}/${vitals.maxHp}${power}`;
}

function unitRow(theme: Theme, unit: UnitView | undefined): string {
  if (!unit) return theme.fg("dim", `${glyph("target")} no current target`);
  const hp = bar({
    cells: 12,
    max: unit.maxHp,
    theme,
    tone: healthTone(unit.hpPct / 100),
    value: unit.hp,
  });
  return `${unitLabel(theme, unit)} L${unit.level} ${hp} ${unit.hp}/${unit.maxHp}`;
}

function castRow(theme: Theme, cast: CastView | undefined): string[] {
  if (!cast) return [];
  const progress = bar({
    cells: 12,
    max: cast.totalMs,
    theme,
    tone: "warning",
    value: cast.elapsedMs,
  });
  return [
    `${theme.fg("warning", glyph("cast"))} ${cast.spell} ${progress} ${seconds(cast.elapsedMs)}/${seconds(cast.totalMs)}`,
  ];
}

function travelCall(args: unknown, theme: Theme): string {
  const within = argText(args, "within");
  return callLine({
    icon: "route",
    parts: [`→ ${argText(args, "to") ?? "?"}`, within && `within ${within}y`],
    theme,
    verb: "travel",
  });
}

function travelProgress(theme: Theme, after: TravelAfter): string {
  const walked = yards(after.traveledYd);
  const time = theme.fg("muted", seconds(after.elapsedMs));
  if (after.totalYd === undefined)
    return `${theme.fg("accent", glyph("route"))} ${walked} walked ${time}`;
  const progress = bar({
    cells: 20,
    max: after.totalYd,
    theme,
    tone: "accent",
    value: after.traveledYd,
  });
  const left =
    after.remainingYd === undefined
      ? ""
      : ` · ${yards(after.remainingYd)} left`;
  return `${theme.fg("accent", glyph("route"))} ${progress} ${walked}/${yards(after.totalYd)}${left} ${time}`;
}

function legRow(theme: Theme, leg: LegView): string {
  const why = leg.reason ? ` ${leg.reason}` : "";
  return `${theme.fg("dim", `leg ${leg.index + 1}`)} ${theme.fg(LEG_TONE[leg.status], leg.status)}${why} ${yards(leg.traveledYd)}`;
}

function travelBody({
  after,
  theme,
  running,
  expanded,
}: BodyInit<"travel">): string[] {
  const goal = `${glyph("mapPin")} ${goalText(after.goal)}`;
  if (running) return [travelProgress(theme, after), goal];
  const summary = `walked ${yards(after.traveledYd)} in ${seconds(after.elapsedMs)} · ${after.legs.length} legs`;
  const floors = after.floors
    ? [
        `floors ${after.floors.map((z) => z.toFixed(1)).join(", ")}${after.floorRetried ? " (retried)" : ""}`,
      ]
    : [];
  const seen =
    after.newInView.length > 0
      ? [
          `new in view: ${after.newInView.map((unit) => unitLabel(theme, unit)).join(", ")}`,
        ]
      : [];
  const legs = expanded ? after.legs.map((leg) => legRow(theme, leg)) : [];
  return [goal, summary, ...floors, ...seen, ...legs];
}

function engageCall(args: unknown, theme: Theme): string {
  const count = argText(args, "count");
  const quest = argText(args, "quest");
  const how = argText(args, "how");
  const parts = [
    argText(args, "target") ?? "nearest hostile",
    count && `×${count}`,
    quest && `quest ${quest}`,
    how && `"${how}"`,
  ];
  return callLine({ icon: "combat", parts, theme, verb: "engage" });
}

function strip(theme: Theme, decisions: readonly JevDecisionView[]): string {
  const g = glyphs();
  const cells = decisions.slice(-STRIP_CELLS).map((d) => {
    const { icon, tone } = DECISION[d.kind];
    return d.disposition === "discarded"
      ? theme.fg("dim", g[icon])
      : theme.fg(tone, g[icon]);
  });
  return `${theme.fg("muted", `${g.jevDecision} Jev`)} ${cells.join("")}`;
}

function tally(theme: Theme, after: EngageAfter): string {
  const g = glyphs();
  const kills = `${g.kill} ${after.kills}/${after.wanted}`;
  const loot =
    after.loot.length > 0 ? ` · ${g.loot} ${after.loot.length} items` : "";
  const coins = after.copper > 0 ? ` · ${money(theme, after.copper)}` : "";
  return `${kills} · ${theme.fg("success", `${g.xp} +${after.xp} xp`)}${loot}${coins}`;
}

function targetLine(t: EngageAfter["targets"][number]): string {
  const why = t.reason ? ` ${t.reason}` : "";
  const time = t.durationMs === undefined ? "" : ` ${span(t.durationMs)}`;
  return `${t.ref} ${t.name} ${t.outcome}${why}${time}`;
}

function engageDetail(theme: Theme, after: EngageAfter): string[] {
  const targets = after.targets.map(targetLine);
  const decisions = after.decisions.map((d) =>
    theme.fg(
      "dim",
      `${glyph(DECISION[d.kind].icon)} ${d.label} ${d.disposition}`,
    ),
  );
  const errors = [...after.castErrors, ...after.swingErrors].map((e) =>
    theme.fg("warning", `${e.word} (${e.code}) ×${e.count}`),
  );
  const timeouts =
    after.timeouts > 0
      ? [theme.fg("warning", `Jev timeouts ${after.timeouts}`)]
      : [];
  return [...targets, ...decisions, ...errors, ...timeouts];
}

function engageBody({ after, theme, expanded }: BodyInit<"engage">): string[] {
  const rows = [
    unitRow(theme, after.current),
    vitalsRow(theme, after.self),
    ...castRow(theme, after.cast),
    strip(theme, after.decisions),
    tally(theme, after),
  ];
  return expanded ? [...rows, ...engageDetail(theme, after)] : rows;
}

function restCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "idle",
    parts: [`until ${argText(args, "until") ?? "90"}%`],
    theme,
    verb: "rest",
  });
}

function restBody({ after, theme, expanded }: BodyInit<"rest">): string[] {
  const g = glyphs();
  const hp = `${g.health} ${bar({ cells: 12, max: 100, theme, tone: healthTone(after.hpPct / 100), value: after.hpPct })} ${after.hpPct}%`;
  const mana =
    after.manaPct === undefined
      ? ""
      : `  ${g.mana} ${bar({ cells: 12, max: 100, theme, tone: "mdLink", value: after.manaPct })} ${after.manaPct}%`;
  const used =
    after.used.length > 0
      ? `used ${after.used.map((item) => `${item.name} ×${item.count}`).join(", ")}`
      : "no food or drink used";
  const more = [
    `aura seen: ${after.auraConfirmed ? "yes" : "no"}`,
    `items left: ${after.itemsLeft}`,
    `time: ${seconds(after.durationMs)}`,
  ];
  return [`${hp}${mana}`, used, ...(expanded ? more : [])];
}

function recoverCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "ghost",
    parts: [`via ${argText(args, "how") ?? "corpse"}`],
    theme,
    verb: "recover",
  });
}

function recoverBody({
  after,
  theme,
  expanded,
}: BodyInit<"recover">): string[] {
  const g = glyphs();
  const state = after.alive
    ? theme.fg("success", `${g.spiritHealer} alive`)
    : theme.fg("error", `${g.ghost} still dead`);
  const corpse =
    after.corpseYd === undefined
      ? ""
      : ` · ${g.corpse} ${yards(after.corpseYd)}`;
  const head = `${state} via ${after.via} in ${seconds(after.durationMs)} · ${after.legs} legs${corpse}`;
  if (!expanded) return [head];
  const pose = after.pose
    ? [
        `at (${Math.round(after.pose.x)},${Math.round(after.pose.y)}) ${g[COMPASS_GLYPH[after.pose.facing]]}`,
      ]
    : [];
  const hp =
    after.hp === undefined || after.maxHp === undefined
      ? []
      : [`HP ${after.hp}/${after.maxHp}`];
  const other =
    after.alternatives.length > 0
      ? [`other ways: ${after.alternatives.join(` ${chrome().sep} `)}`]
      : [];
  return [head, ...pose, ...hp, ...other];
}

export const travelRenderers: ToolRenderers = {
  renderCall: callRenderer(travelCall),
  renderResult: resultRenderer("travel", travelBody),
};

export const engageRenderers: ToolRenderers = {
  renderCall: callRenderer(engageCall),
  renderResult: resultRenderer("engage", engageBody),
};

export const restRenderers: ToolRenderers = {
  renderCall: callRenderer(restCall),
  renderResult: resultRenderer("rest", restBody),
};

export const recoverRenderers: ToolRenderers = {
  renderCall: callRenderer(recoverCall),
  renderResult: resultRenderer("recover", recoverBody),
};
