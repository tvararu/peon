import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { NpcRole } from "@peon/core";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { UnitView } from "#harness/contract/views";
import { glyphs } from "#harness/ui/context";
import {
  argText,
  drawn,
  glyph,
  RELATION_GLYPH,
  RELATION_TONE,
  STATUS_GLYPH,
  STATUS_TONE,
} from "#harness/ui/draw";
import type { GlyphName } from "#harness/ui/glyphs";
import type { ToolRenderers } from "#harness/ui/renderers/registry";

export type BodyInit<K extends ToolName> = {
  after: AfterMap[K];
  result: ToolResult<AfterMap[K]>;
  theme: Theme;
  expanded: boolean;
  running: boolean;
  width: number;
};

export type CallInit = {
  theme: Theme;
  icon: GlyphName;
  verb: string;
  parts: (string | undefined)[];
};

type Content = AgentToolResult<ToolDetails>["content"];

export const MAX_BODY_ROWS = 5;

const ROLE_GLYPH: Partial<Record<NpcRole, GlyphName>> = {
  flight_master: "flightMaster",
  questgiver: "questgiver",
  repair: "vendor",
  spirit_guide: "spiritHealer",
  spirit_healer: "spiritHealer",
  trainer: "trainer",
  vendor: "vendor",
};

export function detailsOf<K extends ToolName>(
  result: AgentToolResult<ToolDetails>,
  tool: K,
): ToolResult<AfterMap[K]> {
  if (result.details.tool !== tool)
    throw new Error(`renderer for ${tool} got ${result.details.tool}`);
  return result.details.result as ToolResult<AfterMap[K]>;
}

export function unitGlyph(unit: UnitView): string {
  if (!unit.alive) return glyph(unit.lootable ? "lootable" : "dead");
  const role = unit.roles
    .map((r) => ROLE_GLYPH[r])
    .find((name) => name !== undefined);
  return glyph(role ?? RELATION_GLYPH[unit.relation]);
}

export function unitLabel(theme: Theme, unit: UnitView): string {
  const tone = unit.alive ? RELATION_TONE[unit.relation] : "dim";
  return `${theme.fg(tone, `${unitGlyph(unit)} ${unit.name}`)} ${theme.fg("dim", unit.ref)}`;
}

export function callLine({ theme, icon, verb, parts }: CallInit): string {
  const rest = parts
    .filter((part) => part !== undefined && part.length > 0)
    .join(" ");
  const tail = rest ? ` ${theme.fg("muted", rest)}` : "";
  return `${theme.fg("accent", glyph(icon))} ${theme.fg("toolTitle", theme.bold(verb))}${tail}`;
}

export function headLine(theme: Theme, result: ToolResult<unknown>): string {
  const tone = STATUS_TONE[result.status];
  const tag = result.status === "RUNNING" ? result.runId : result.reason;
  const repeat =
    result.reason === "repeat"
      ? theme.fg("dim", ` ${glyph("clock")} repeat`)
      : "";
  const label = `${glyph(STATUS_GLYPH[result.status])} ${result.status}${tag ? ` ${tag}:` : ""}`;
  return `${theme.fg(tone, label)} ${result.detail}${repeat}`;
}

export function tailLines(
  theme: Theme,
  content: Content,
  result: ToolResult<unknown>,
): string[] {
  const text = content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
  const danger = text.split("\n").find((line) => line.startsWith("Danger:"));
  const lines = danger
    ? [theme.fg("error", `${glyph("warning")} ${danger}`)]
    : [];
  return result.next
    ? [...lines, theme.fg("dim", `Next: ${result.next}`)]
    : lines;
}

export function collapse(
  theme: Theme,
  lines: readonly string[],
  expanded: boolean,
): string[] {
  if (expanded || lines.length <= MAX_BODY_ROWS) return [...lines];
  const more = lines.length - (MAX_BODY_ROWS - 1);
  return [
    ...lines.slice(0, MAX_BODY_ROWS - 1),
    theme.fg("dim", `${glyphs().clock} +${more} more (ctrl+o)`),
  ];
}

export function callRenderer(
  draw: (args: unknown, theme: Theme) => string,
): ToolRenderers["renderCall"] {
  return (args, theme) => drawn(() => [draw(args, theme)]);
}

export function resultRenderer<K extends ToolName>(
  tool: K,
  body: (init: BodyInit<K>) => string[],
): ToolRenderers["renderResult"] {
  return (toolResult, options, theme) => {
    const result = detailsOf(toolResult, tool);
    const running = options.isPartial || result.status === "RUNNING";
    return drawn((width) => {
      const lines = body({
        after: result.after,
        expanded: options.expanded,
        result,
        running,
        theme,
        width,
      });
      return [
        headLine(theme, result),
        ...collapse(theme, lines, options.expanded),
        ...tailLines(theme, toolResult.content, result),
      ];
    });
  };
}

function evidenceRows(theme: Theme, result: ToolResult<unknown>): string[] {
  return (result.evidence ?? []).map((row) =>
    theme.fg("dim", `#${row.seq} ${row.event}`),
  );
}

function socialCall(args: unknown, theme: Theme): string {
  const to = argText(args, "to");
  const action = argText(args, "do") ?? (to ? "whisper" : "say");
  const text = argText(args, "text");
  const quoted = text === undefined ? undefined : `"${text}"`;
  return callLine({
    icon: to ? "whisper" : "say",
    parts: [action, to && `→ ${to}`, quoted],
    theme,
    verb: "social",
  });
}

function socialBody({
  after,
  result,
  theme,
  expanded,
}: BodyInit<"social">): string[] {
  if (!expanded) return [];
  const echo = after.confirmed
    ? "the server echo confirmed it"
    : "no server echo was seen";
  const system = after.systemLine
    ? [theme.fg("muted", `${glyph("system")} ${after.systemLine}`)]
    : [];
  return [theme.fg("dim", echo), ...system, ...evidenceRows(theme, result)];
}

function stopCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "runFailed",
    parts: [argText(args, "run") ?? "everything"],
    theme,
    verb: "stop",
  });
}

function stopBody({
  after,
  result,
  theme,
  expanded,
}: BodyInit<"stop">): string[] {
  if (!expanded) return [];
  const runs = after.stopped.map(
    (run) =>
      `${run.id} ${run.kind} ${run.status}${run.reason ? ` ${run.reason}` : ""}`,
  );
  const vitals = `HP ${after.self.hp}/${after.self.maxHp}`;
  const attackers = after.attackers.map((a) =>
    theme.fg("error", `${glyph("hostile")} ${a.name} ${a.ref}`),
  );
  return [...runs, vitals, ...attackers, ...evidenceRows(theme, result)];
}

export const socialRenderers: ToolRenderers = {
  renderCall: callRenderer(socialCall),
  renderResult: resultRenderer("social", socialBody),
};

export const stopRenderers: ToolRenderers = {
  renderCall: callRenderer(stopCall),
  renderResult: resultRenderer("stop", stopBody),
};
