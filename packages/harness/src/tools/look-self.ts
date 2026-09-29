import type { AreaState } from "@peon/core";
import type { LookAfter, LookCast } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import type { PlaceView, PoseView, VitalsView } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";
import { manaText } from "#harness/ops/views";
import { ageText } from "#harness/tools/look-rows";

function powerText(vitals: VitalsView): string {
  const { maxPower, power, powerKind } = vitals;
  if (powerKind === "none" || maxPower === 0) return "";
  if (powerKind === "mana") return `${manaText(vitals)}, `;
  return `${powerKind.replace("_", " ")} ${power}, `;
}

function placeText({ ageMs, area, zone }: PlaceView): string {
  const where =
    [zone, area].filter((part) => part !== undefined).join(", ") ||
    "Zone unknown";
  return ageMs === undefined
    ? `${where}.`
    : `${where} (area ${ageText(ageMs)} old).`;
}

function poseText(pose: PoseView | undefined): string {
  if (!pose) return "Position unknown.";
  const fix =
    pose.serverFixAgeMs === undefined
      ? "no server fix yet"
      : `server fix ${ageText(pose.serverFixAgeMs)} ago`;
  return `${Math.round(pose.x)}, ${Math.round(pose.y)}, facing ${pose.facing}. Pose ${pose.source}, ${fix}.`;
}

type UnitCast = AreaState<"spells">["unitCasts"][number];

function secondsLeft(ms: number): string {
  const tenths = Math.round(ms / 100);
  return tenths % 10 === 0
    ? `${tenths / 10} s`
    : `${(tenths / 10).toFixed(1)} s`;
}

function castText(word: string, cast: LookCast | undefined): string {
  return cast
    ? `${word} ${cast.spellName}, ${secondsLeft(cast.remainingMs)} left`
    : "";
}

function spellLabel(ctx: ToolCtx<LookAfter>, spellId: number): string {
  return ctx.handle.spellDefinition(spellId)?.name || `spell ${spellId}`;
}

function unitCastView(
  ctx: ToolCtx<LookAfter>,
  cast: UnitCast | undefined,
  now: number,
): LookCast | undefined {
  if (!cast) return undefined;
  const remainingMs = cast.startedAt + cast.durationMs - now;
  if (remainingMs <= 0) return undefined;
  return {
    remainingMs,
    spellId: cast.spellId,
    spellName: spellLabel(ctx, cast.spellId),
  };
}

function channelLeft(
  channel: { endsAt?: number; durationMs?: number; startedAt: number },
  now: number,
): number | undefined {
  if (channel.endsAt !== undefined) return channel.endsAt - now;
  if (channel.durationMs === undefined) return undefined;
  return channel.startedAt + channel.durationMs - now;
}

export function castViews(
  ctx: ToolCtx<LookAfter>,
  target: LookAfter["target"],
): Pick<LookAfter, "channel" | "targetCast"> {
  const now = ctx.rt.clock.now();
  const { channel, unitCasts } = ctx.handle.spells.state();
  const left = channel && channelLeft(channel, now);
  const own =
    channel && left !== undefined && left > 0
      ? {
          remainingMs: left,
          spellId: channel.spellId,
          spellName: spellLabel(ctx, channel.spellId),
        }
      : undefined;
  const aimed = target
    ? unitCasts.find((cast) => guidHex(cast.guid) === target.guid)
    : undefined;
  const theirs = unitCastView(ctx, aimed, now);
  return {
    ...(own ? { channel: own } : {}),
    ...(theirs ? { targetCast: theirs } : {}),
  };
}

export function selfLine({
  channel,
  place,
  self,
}: Pick<LookAfter, "channel" | "place" | "self">): string {
  const combat = self.inCombat ? "in combat" : "not in combat";
  const posture = self.posture ? `${self.posture}, ` : "";
  const channelling = channel ? `, ${castText("channelling", channel)}` : "";
  const vitals = `HP ${self.hp}/${self.maxHp}, ${powerText(self)}${self.life}, ${posture}${combat}${channelling}`;
  return `${self.name} L${self.level} ${self.className}, ${vitals}. ${placeText(place)} ${poseText(self.pose)}`;
}

export function statusLine({ run, target, targetCast }: LookAfter): string {
  const casting = targetCast ? `, ${castText("casting", targetCast)}` : "";
  const aimed = target
    ? `${target.ref} ${target.name} ${target.hpPct}%${casting}`
    : "none";
  if (!run) return `Target: ${aimed}. Running: nothing.`;
  return `Target: ${aimed}. Running: ${run.id} ${run.label} (${ageText(run.elapsedMs)}). It is still running. End your turn to wait.`;
}
