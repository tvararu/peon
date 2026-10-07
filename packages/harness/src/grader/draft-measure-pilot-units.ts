import type { MeasureContext, Measured } from "#harness/grader/draft-anchors";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { pilotRun } from "#harness/grader/draft-measure-pilot";
import { isRecord } from "#harness/grader/exec";

const OFFENDING_EVENTS: Record<string, true> = {
  "combat/attacked": true,
  "control/server_correction": true,
  "threat/aggro_switch": true,
  "threat/engaged": true,
};

const field = (row: GameLogRow | undefined, key: string): unknown =>
  row !== undefined && isRecord(row.data) ? row.data[key] : undefined;

const timeOf = (row: GameLogRow): number =>
  typeof row.ts === "number" && Number.isFinite(row.ts) ? row.ts : 0;

type Window = {
  line: number | undefined;
  from: number;
  until: number;
  completed: boolean;
  status: unknown;
  reason: unknown;
};

function pilotWindow(rows: readonly GameLogRow[]): Window | undefined {
  const run = pilotRun(rows);
  const first = rows.find((row) => row.event === "pilot/started");
  if (run === undefined || first === undefined) return undefined;
  return {
    completed: field(run.ended, "status") === "completed",
    from: Math.min(timeOf(first), run.from),
    line: first.line,
    reason:
      run.ended === undefined ? "no pilot/ended" : field(run.ended, "reason"),
    status: field(run.ended, "status"),
    until: run.until,
  };
}

function travelWindow(rows: readonly GameLogRow[]): Window | undefined {
  const startIndex = rows.findLastIndex(
    (row) => row.event === "run/started" && field(row, "kind") === "travel",
  );
  const started = startIndex < 0 ? undefined : rows[startIndex];
  if (started === undefined) return undefined;
  const id = field(started, "id");
  const ended = rows
    .slice(startIndex + 1)
    .find(
      (row) =>
        (row.event === "run/ended" || row.event === "run/cancelled") &&
        field(row, "id") === id,
    );
  const succeeded =
    ended?.event === "run/ended" && field(ended, "status") === "succeeded";
  const first = rows.find(
    (row) => row.event === "run/started" && field(row, "kind") === "travel",
  );
  return {
    completed: succeeded,
    from: timeOf(first ?? started),
    line: (first ?? started).line,
    reason: ended === undefined ? "no run/ended" : field(ended, "reason"),
    status: field(ended, "status"),
    until: ended === undefined ? Number.POSITIVE_INFINITY : timeOf(ended),
  };
}

const listsAttackers = (row: GameLogRow): boolean => {
  const attackers = field(row, "attackers");
  return Array.isArray(attackers) && attackers.length > 0;
};

const offends = (row: GameLogRow): boolean =>
  OFFENDING_EVENTS[row.event] === true ||
  (row.event === "snapshot/world" && listsAttackers(row));

function noAggro(
  rows: readonly GameLogRow[],
  window: Window | undefined,
  none: string,
): Measured {
  if (window === undefined) return { met: false, observed: { reason: none } };
  const inside = rows.filter(
    (row) => timeOf(row) >= window.from && timeOf(row) <= window.until,
  );
  const count = (event: string) =>
    inside.filter((row) => row.event === event).length;
  const first = inside.find(offends);
  return {
    line: first?.line ?? window.line,
    met: window.completed && first === undefined,
    observed: {
      attacked: count("combat/attacked"),
      corrections: count("control/server_correction"),
      firstOffending:
        first === undefined
          ? null
          : { event: first.event, line: first.line, text: first.text },
      reason: window.reason,
      snapshotsWithAttackers: inside.filter(
        (row) => row.event === "snapshot/world" && listsAttackers(row),
      ).length,
      status: window.status,
      threats: count("threat/engaged") + count("threat/aggro_switch"),
    },
  };
}

export function pilotNoAggro(rows: readonly GameLogRow[]): Measured {
  return noAggro(rows, pilotWindow(rows), "no pilot/started");
}

export function travelNoAggro(rows: readonly GameLogRow[]): Measured {
  return noAggro(rows, travelWindow(rows), "no travel run/started");
}

const REF_PATTERN = /^u\d+$/;

const MOVE_STARTS = [
  "MSG_MOVE_START_FORWARD",
  "MSG_MOVE_START_BACKWARD",
  "MSG_MOVE_START_STRAFE_LEFT",
  "MSG_MOVE_START_STRAFE_RIGHT",
  "MSG_MOVE_START_SWIM",
];

type FightMoves = { away: number; total: number };

function kiteMoves(
  packets: unknown[] | null,
  jev: unknown[] | null,
  from: number,
  until: number,
): FightMoves | undefined {
  if (packets === null || jev === null) return undefined;
  const moves = packets.flatMap((entry) => {
    if (!isRecord(entry) || entry["dir"] !== "out") return [];
    const at = entry["at"];
    if (typeof at !== "number" || !Number.isFinite(at)) return [];
    if (at < from || at > until) return [];
    return typeof entry["opcode"] === "string" &&
      MOVE_STARTS.includes(entry["opcode"])
      ? [at]
      : [];
  });
  const requests = (jev ?? []).flatMap((entry) => {
    if (!isRecord(entry) || entry["type"] !== "request") return [];
    const ts = entry["ts"];
    const observation = entry["observation"];
    const separation = isRecord(observation)
      ? observation["separation"]
      : undefined;
    if (
      typeof ts !== "number" ||
      !Number.isFinite(ts) ||
      typeof separation !== "number" ||
      !Number.isFinite(separation)
    )
      return [];
    return ts >= from && ts <= until ? [{ separation, ts }] : [];
  });
  const away = moves.filter((at) => {
    const before = requests.filter((request) => request.ts <= at).at(-1);
    const after = requests.find((request) => request.ts > at);
    return (
      before !== undefined &&
      after !== undefined &&
      after.separation > before.separation
    );
  }).length;
  return { away, total: moves.length };
}

type Creature = NonNullable<MeasureContext["creature"]>;
type FightKill = { kill: GameLogRow; engage: GameLogRow; from: number };

const guidOf = (row: GameLogRow): string | undefined =>
  typeof row.guid === "string" ? row.guid : undefined;

const CONTACT_FIELDS: Record<string, string | undefined> = {
  "combat/attack_start": "target",
  "combat/attacked": "attacker",
  "combatlog/swing_in": "source",
  "fight/start": undefined,
};

function kiteEngages(rows: readonly GameLogRow[]): GameLogRow[] {
  return rows.filter((row) => {
    const args = field(row, "args");
    return (
      row.event === "run/started" &&
      field(row, "kind") === "engage" &&
      isRecord(args) &&
      args["kite"] === true
    );
  });
}

function engagedGuids(
  rows: readonly GameLogRow[],
  engage: GameLogRow,
): Set<string> {
  const args = field(engage, "args");
  const target = isRecord(args) ? args["target"] : undefined;
  const ref = typeof target === "string" && REF_PATTERN.test(target);
  const guids = new Set<string>();
  for (const row of rows) {
    const guid = guidOf(row);
    if (guid === undefined) continue;
    if (row.event === "fight/start" && row.runId === field(engage, "id"))
      guids.add(guid);
    if (ref && row.ref === target) guids.add(guid);
  }
  return guids;
}

function isCreature(
  rows: readonly GameLogRow[],
  kill: GameLogRow,
  creature: Creature,
): boolean {
  const name = field(kill, "name");
  if (
    typeof name !== "string" ||
    name.toLowerCase() !== creature.name.toLowerCase()
  )
    return false;
  return rows
    .filter((row) => guidOf(row) === guidOf(kill))
    .every((row) => {
      const entry = field(row, "entry");
      return typeof entry !== "number" || entry === creature.entry;
    });
}

function firstContact(
  rows: readonly GameLogRow[],
  guid: string,
  before: number,
): number | undefined {
  const times = rows
    .slice(0, before)
    .filter((row) => {
      const key = CONTACT_FIELDS[row.event];
      if (!(row.event in CONTACT_FIELDS)) return false;
      return (
        guidOf(row) === guid || (key !== undefined && field(row, key) === guid)
      );
    })
    .map(timeOf);
  return times.length === 0 ? undefined : Math.min(...times);
}

function kiteKill(
  rows: readonly GameLogRow[],
  creature: Creature,
): FightKill | string {
  const kills = rows.filter(
    (row) =>
      row.event === "combat/kill_credit" &&
      guidOf(row) !== undefined &&
      isCreature(rows, row, creature),
  );
  if (kills.length === 0) return `no combat/kill_credit for ${creature.name}`;
  const engages = kiteEngages(rows);
  for (const kill of kills) {
    const killIndex = rows.indexOf(kill);
    const guid = guidOf(kill) ?? "";
    const engage = engages.find(
      (row) =>
        rows.indexOf(row) < killIndex && engagedGuids(rows, row).has(guid),
    );
    if (engage === undefined) continue;
    const contact = firstContact(rows, guid, killIndex);
    return {
      engage,
      from: Math.min(timeOf(engage), contact ?? timeOf(engage)),
      kill,
    };
  }
  return `no engage with kite: true on the guid of the ${creature.name} kill`;
}

function kiteSwings(
  rows: readonly GameLogRow[],
  from: number,
  until: number,
): number {
  return rows.filter(
    (row) =>
      row.event === "combatlog/swing_in" &&
      timeOf(row) >= from &&
      timeOf(row) <= until,
  ).length;
}

function kiteHealth(
  rows: readonly GameLogRow[],
  from: number,
  until: number,
): number | null {
  const worlds = rows.filter(
    (row) =>
      row.event === "snapshot/world" &&
      timeOf(row) >= from &&
      timeOf(row) <= until &&
      isRecord(field(row, "self")),
  );
  const self = field(worlds.at(-1), "self");
  const hp = isRecord(self) ? self["hp"] : undefined;
  const maxHp = isRecord(self) ? self["maxHp"] : undefined;
  return typeof hp === "number" &&
    typeof maxHp === "number" &&
    Number.isFinite(hp) &&
    Number.isFinite(maxHp) &&
    maxHp > 0
    ? Math.round((hp / maxHp) * 100)
    : null;
}

export function pilotKite(
  rows: readonly GameLogRow[],
  { creature, jev, packets }: MeasureContext,
): Measured {
  if (creature === undefined)
    return {
      met: false,
      observed: { reason: "the check names no creature in its evidence" },
    };
  const fight = kiteKill(rows, creature);
  if (typeof fight === "string")
    return { met: false, observed: { reason: fight } };
  const { engage, from, kill } = fight;
  const until = timeOf(kill);
  const swings = kiteSwings(rows, from, until);
  const dead = rows.find(
    (row) => row.event === "life/dead" && timeOf(row) >= until,
  );
  const moves = kiteMoves(packets, jev, from, until);
  return {
    line: kill.line,
    met: swings === 0 && dead === undefined,
    observed: {
      dead: dead === undefined ? null : { line: dead.line, text: dead.text },
      endHealthPct: kiteHealth(rows, from, until),
      engage: { line: engage.line, ts: engage.ts },
      fightFrom: from,
      kill: { guid: kill.guid, line: kill.line, name: field(kill, "name") },
      movesAway: moves?.away ?? null,
      movesTotal: moves?.total ?? null,
      reason:
        moves === undefined ? "packets.jsonl or jev.jsonl is missing" : null,
      swings,
    },
  };
}
