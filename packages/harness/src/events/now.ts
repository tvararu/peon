import type {
  CastView,
  NearestKind,
  NowSnapshot,
  PlaceView,
  PoseView,
  RecoveryView,
  SelfView,
  UnitView,
} from "#harness/contract/views";

export const NOW_MAX_CHARS = 300;

const NEAREST_ORDER: readonly NearestKind[] = [
  "hostile",
  "attackable",
  "questgiver",
  "vendor",
  "trainer",
  "repair",
  "innkeeper",
  "lootable",
  "player",
  "spirit_healer",
];

type Part = { text: string; drop: number };

export function nowClock(at: number): string {
  return new Date(at).toISOString().slice(11, 19);
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

function yards(distance: number | undefined): string {
  return distance === undefined ? "?y" : `${Math.round(distance)}y`;
}

function powerText({ power, maxPower, powerKind }: SelfView): string {
  if (powerKind === "none") return "";
  if (powerKind !== "mana") return ` ${powerKind.replace("_", " ")} ${power}`;
  return ` mana ${power}/${maxPower}`;
}

function selfText({ at, self, hpDelta5s }: NowSnapshot): string {
  const delta = hpDelta5s
    ? ` (${hpDelta5s > 0 ? "+" : ""}${hpDelta5s} in 5s)`
    : "";
  const combat = self.inCombat ? " in combat" : "";
  const head = `[now ${nowClock(at)}] ${self.name} L${self.level} ${self.className}`;
  return `${head} HP ${self.hp}/${self.maxHp}${delta}${powerText(self)} ${self.life}${combat}`;
}

function poseText(pose: PoseView | undefined): string {
  if (!pose) return " (no position)";
  const fix =
    pose.serverFixAgeMs === undefined
      ? "no server fix"
      : `server fix ${seconds(pose.serverFixAgeMs)}s`;
  return ` (${Math.round(pose.x)},${Math.round(pose.y)}) ${fix}`;
}

function placeText(place: PlaceView, pose: PoseView | undefined): string {
  const area = place.area ? `, ${place.area}` : "";
  return `${place.zone ?? "unknown zone"}${area}${poseText(pose)}`;
}

function targetText(target: UnitView): string {
  return `target ${target.name} ${target.ref} ${target.relation} ${yards(target.distance)} ${target.hp}/${target.maxHp}`;
}

function castText({ spell, elapsedMs, totalMs }: CastView): string {
  return `casting ${spell} ${(elapsedMs / 1000).toFixed(1)}/${(totalMs / 1000).toFixed(1)}s`;
}

function recoveryText({
  corpseYd,
  corpseCompass,
  reclaimInMs,
}: RecoveryView): string {
  const compass = corpseCompass ? ` ${corpseCompass}` : "";
  const reclaim =
    reclaimInMs === undefined ? "" : ` reclaim in ${seconds(reclaimInMs)}s`;
  return `corpse ${yards(corpseYd)}${compass}${reclaim}`;
}

function nearestText(nearest: NowSnapshot["nearest"]): string {
  const shown = new Set<string>();
  const items: string[] = [];
  for (const kind of NEAREST_ORDER) {
    const unit = nearest[kind];
    if (!unit || shown.has(unit.ref)) continue;
    shown.add(unit.ref);
    items.push(`${kind} ${unit.ref} ${yards(unit.distance)}`);
  }
  return items.length > 0 ? `nearest ${items.join(", ")}` : "";
}

function parts(s: NowSnapshot): Part[] {
  const attackers = s.attackers.map((attacker) => attacker.ref).join(",");
  const running = s.run
    ? `running ${s.run.id} ${s.run.kind} ${seconds(s.run.elapsedMs)}s`
    : "";
  const list: Part[] = [
    { drop: 0, text: selfText(s) },
    { drop: 0, text: s.breathS === undefined ? "" : `breath ${s.breathS} s` },
    { drop: 0, text: placeText(s.place, s.self.pose) },
    { drop: 1, text: s.target ? targetText(s.target) : "" },
    { drop: 2, text: attackers ? `attackers ${attackers}` : "" },
    { drop: 4, text: s.selfCast ? castText(s.selfCast) : "" },
    { drop: 0, text: running },
    { drop: 3, text: s.recovery ? recoveryText(s.recovery) : "" },
    { drop: 5, text: nearestText(s.nearest) },
  ];
  return list.filter((part) => part.text !== "");
}

function fit(list: Part[]): string {
  const kept = [...list];
  const line = () => kept.map((part) => part.text).join(" · ");
  const droppable = list
    .filter((part) => part.drop > 0)
    .sort((a, b) => b.drop - a.drop);
  for (const part of droppable) {
    if (line().length <= NOW_MAX_CHARS) break;
    kept.splice(kept.indexOf(part), 1);
  }
  return line().slice(0, NOW_MAX_CHARS);
}

function progressText({ noProgress }: NowSnapshot): string | undefined {
  if (!noProgress) return;
  const { actions, lastRefusal, sinceMs, untried } = noProgress;
  const span =
    sinceMs < 60_000
      ? `${seconds(sinceMs)}s`
      : `${Math.round(sinceMs / 60_000)} min`;
  const refusal = lastRefusal ? ` (last refusal ${lastRefusal})` : "";
  const options = untried.length > 0 ? ` Untried: ${untried.join(", ")}.` : "";
  return `No progress: ${actions} actions in ${span}${refusal}. Change plan.${options}`;
}

export function formatNow(snapshot: NowSnapshot): string {
  const lines = [
    fit(parts(snapshot)),
    progressText(snapshot),
    snapshot.wake ? undefined : "Wake is off.",
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}
