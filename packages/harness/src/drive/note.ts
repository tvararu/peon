import type { ControlPose, Unsubscribe } from "@peon/core";
import type { GameLogEntry } from "#harness/contract/log";
import type { Frozen, WorldReads, WorldService } from "#harness/world/service";

export const NOTE_LINES_CAP = 12;

const KEPT = [
  "combat/",
  "fight/",
  "loot/",
  "quest/",
  "xp/",
  "money/",
  "life/",
  "chat/",
  "control/place_changed",
  "control/teleport",
];

export type Pose = Frozen<ControlPose>;

type SelfNow = {
  health: number | undefined;
  maxHealth: number | undefined;
  power: number | undefined;
  maxPower: number | undefined;
  powerType: number | undefined;
  target: { name: string | undefined } | undefined;
};

export type HandBack = {
  durationMs: number;
  from: Pose | undefined;
  to: Pose | undefined;
  targets: readonly string[];
  actions: readonly string[];
  stopped: readonly string[];
  lines: readonly string[];
  self: SelfNow | undefined;
};

export type Journal = {
  target: (name: string) => void;
  action: (text: string) => void;
  finish: (reads: WorldReads | undefined, lastPose?: Pose) => HandBack;
  dispose: Unsubscribe;
};

export function startJournal(world: WorldService, now: () => number): Journal {
  const startedAt = now();
  const from = world.current()?.reads.getControlState().pose;
  const targets: string[] = [];
  const actions: string[] = [];
  const lines: string[] = [];
  const stopped: string[] = [];
  const dispose = world.log.subscribe((entry: Frozen<GameLogEntry>) => {
    if (entry.event === "run/cancelled") stopped.push(entry.text);
    else if (KEPT.some((prefix) => entry.event.startsWith(prefix)))
      lines.push(entry.text);
  });
  return {
    action: (text) => actions.push(text),
    dispose,
    finish: (reads, lastPose) => ({
      actions,
      durationMs: now() - startedAt,
      from,
      lines,
      self: reads && selfNow(reads),
      stopped,
      targets,
      to: reads?.getControlState().pose ?? lastPose,
    }),
    target(name) {
      if (targets.at(-1) !== name) targets.push(name);
    },
  };
}

function selfNow(reads: WorldReads): SelfNow {
  const { self, target, selectedGuid } = reads.getCombatState();
  return {
    health: self.health,
    maxHealth: self.maxHealth,
    maxPower: self.maxPower,
    power: self.power,
    powerType: self.powerType,
    target:
      selectedGuid === undefined
        ? undefined
        : { name: target?.guid === selectedGuid ? target.name : undefined },
  };
}

function seconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))} s`;
}

function place(pose: Pose): string {
  return `${Math.round(pose.x)}, ${Math.round(pose.y)}`;
}

function moved(from: Pose | undefined, to: Pose | undefined): string {
  if (!(from && to)) return "Movement: no pose was observed.";
  if (from.mapId !== to.mapId)
    return `Moved to another map (${to.mapId}), now at ${place(to)}.`;
  const yards = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
  const source =
    to.source === "server"
      ? "the end pose is from the server"
      : "the end pose is the client's prediction";
  return `Moved ${yards} yd, from ${place(from)} to ${place(to)} (${source}).`;
}

function ratio(value: number | undefined, max: number | undefined): string {
  return value === undefined ? "unknown" : `${value}/${max ?? "?"}`;
}

function status(self: SelfNow | undefined): string {
  if (!self) return "Now: offline.";
  const power = self.powerType === 0 ? "mana" : "power";
  const target = self.target
    ? `, target ${self.target.name ?? "selected, name not observed"}`
    : ", no target";
  return `Now: HP ${ratio(self.health, self.maxHealth)}, ${power} ${ratio(self.power, self.maxPower)}${target}.`;
}

export function counted(items: readonly string[]): string[] {
  const out: { text: string; n: number }[] = [];
  for (const text of items) {
    const last = out.at(-1);
    if (last?.text === text) last.n += 1;
    else out.push({ n: 1, text });
  }
  return out.map(({ text, n }) => (n > 1 ? `${text} (x${n})` : text));
}

function logLines(raw: readonly string[]): string[] {
  const lines = counted(raw);
  if (lines.length === 0) return ["Game log while driving: nothing new."];
  const shown = lines.slice(-NOTE_LINES_CAP);
  const more = lines.length - shown.length;
  return [
    "Game log while driving:",
    ...(more > 0 ? [`(${more} earlier lines not shown)`] : []),
    ...shown,
  ];
}

export function handBackNote(back: HandBack, ended?: string): string {
  const how = ended
    ? `; control returned to the agent because ${ended}`
    : " and handed control back";
  return [
    `[human] The human drove the character for ${seconds(back.durationMs)}${how}.`,
    ...back.stopped.map((line) => `Taking over stopped: ${line}`),
    moved(back.from, back.to),
    ...(back.targets.length > 0
      ? [`Targets picked: ${back.targets.join(", ")}.`]
      : []),
    ...(back.actions.length > 0
      ? [`Human actions: ${counted(back.actions).join("; ")}.`]
      : []),
    ...logLines(back.lines),
    status(back.self),
  ].join("\n");
}
