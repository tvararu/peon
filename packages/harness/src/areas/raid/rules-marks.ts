import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";
import { compassWord } from "#harness/ops/explore";
import { compassTo } from "#harness/ops/range";

type RaidEvent = AreaEventOf<"raid">;
type Of<T extends RaidEvent["type"]> = Extract<RaidEvent, { type: T }>;

const ICON_NAMES = [
  "star",
  "circle",
  "diamond",
  "triangle",
  "moon",
  "square",
  "cross",
  "skull",
] as const;

function iconName(icon: number): string {
  return ICON_NAMES[icon] ?? `icon ${icon}`;
}

function actor(
  event: { who: bigint; name: string },
  rc: RuleInput,
): string | undefined {
  if (event.who === 0n) return undefined;
  if (event.who === rc.selfGuid) return rc.selfName;
  return event.name === "" ? "Someone" : event.name;
}

function targetName(target: bigint, rc: RuleInput): string {
  return rc.lookup.unitName(target) ?? rc.refOf(target);
}

export function markRows(event: Of<"raid_mark">, rc: RuleInput): AreaDraft[] {
  const who = actor(event, rc);
  if (who === undefined) return [];
  const data = { icon: event.icon, name: who, target: `${event.target}` };
  const icon = iconName(event.icon);
  const text =
    event.target === 0n
      ? `${who} cleared the ${icon} mark.`
      : `${who} marked ${targetName(event.target, rc)} with ${icon}.`;
  return [{ class: "passive", data, name: "mark", text }];
}

function whereText(x: number, y: number, rc: RuleInput): string {
  const pose = rc.memo.pose;
  if (!pose) return "";
  const yards = Math.round(Math.hypot(x - pose.x, y - pose.y));
  return `, ${yards} yd ${compassWord(compassTo(pose, { x, y }))} of you`;
}

export function pingRows(
  event: Of<"minimap_ping">,
  rc: RuleInput,
): AreaDraft[] {
  const who = actor(event, rc) ?? "Someone";
  return [
    {
      class: "passive",
      data: { name: who, x: event.x, y: event.y },
      name: "ping",
      text: `${who} pinged the map${whereText(event.x, event.y, rc)}.`,
    },
  ];
}
