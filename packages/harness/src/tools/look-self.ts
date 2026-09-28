import type { LookAfter } from "#harness/contract/details";
import type { PlaceView, PoseView, VitalsView } from "#harness/contract/views";
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

export function selfLine({ place, self }: LookAfter): string {
  const combat = self.inCombat ? "in combat" : "not in combat";
  const vitals = `HP ${self.hp}/${self.maxHp}, ${powerText(self)}${self.life}, ${combat}`;
  return `${self.name} L${self.level} ${self.className}, ${vitals}. ${placeText(place)} ${poseText(self.pose)}`;
}

export function statusLine({ run, target }: LookAfter): string {
  const aimed = target
    ? `${target.ref} ${target.name} ${target.hpPct}%`
    : "none";
  if (!run) return `Target: ${aimed}. Running: nothing.`;
  return `Target: ${aimed}. Running: ${run.id} ${run.label} (${ageText(run.elapsedMs)}). It is still running. End your turn to wait.`;
}
