import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunPaths } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type {
  Clock,
  GameLog,
  WorldSnapshots,
} from "#harness/contract/services";
import type { SnapshotWorld, UnitView } from "#harness/contract/views";

export const SNAPSHOT_EVERY_MS = 5000;
export const SNAPSHOT_UNITS = 30;
export const SNAPSHOT_RANGE_YD = 60;

const CHANGE_FRACTION = 0.05;
const UNSAFE_LABEL = /[^\w.-]/g;
const HEARTBEAT: LogDraft = {
  class: "log",
  data: { unchanged: true },
  domain: "snapshot",
  event: "snapshot/world",
  text: "world unchanged",
};

type SnapshotInit = {
  log: GameLog;
  clock: Clock;
  paths: RunPaths;
  world: () => SnapshotWorld | undefined;
  everyMs?: number;
};

function nearby(units: readonly UnitView[]): UnitView[] {
  return units
    .filter(
      (unit) =>
        unit.distance !== undefined && unit.distance <= SNAPSHOT_RANGE_YD,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, SNAPSHOT_UNITS);
}

function unitRow({
  alive,
  distance,
  entry,
  guid,
  hp,
  level,
  name,
  ref,
  relation,
  targetsMe,
}: UnitView) {
  return {
    alive,
    distance,
    entry,
    guid,
    hp,
    level,
    name,
    ref,
    relation,
    targetingMe: targetsMe,
  };
}

function moved(before: number, after: number, max: number): boolean {
  return max > 0 && Math.abs(after - before) / max >= CHANGE_FRACTION;
}

function unitKey(world: SnapshotWorld): string {
  return nearby(world.units)
    .map((unit) => unit.guid)
    .sort()
    .join(",");
}

function differs(before: SnapshotWorld, after: SnapshotWorld): boolean {
  const { self } = after;
  if (unitKey(before) !== unitKey(after)) return true;
  return (
    moved(before.self.hp, self.hp, self.maxHp) ||
    moved(before.self.power, self.power, self.maxPower)
  );
}

function fullRow(world: SnapshotWorld, cause: "look" | "tick"): LogDraft {
  const units = nearby(world.units).map(unitRow);
  const { attackers, place, self, target } = world;
  const text = `world: HP ${self.hp}/${self.maxHp}, ${units.length} units within ${SNAPSHOT_RANGE_YD} yd`;
  const data = { attackers, cause, place, self, target, units };
  return {
    class: "log",
    data,
    domain: "snapshot",
    event: "snapshot/world",
    text,
  };
}

export function createWorldSnapshots({
  log,
  paths,
  world,
  everyMs = SNAPSHOT_EVERY_MS,
}: SnapshotInit): WorldSnapshots {
  let last: SnapshotWorld | undefined;
  const capture = (cause: "look" | "tick") => {
    const current = world();
    if (!current) return;
    const changed =
      cause === "look" || last === undefined || differs(last, current);
    if (changed) last = current;
    log.append(changed ? fullRow(current, cause) : HEARTBEAT);
  };
  return {
    attach() {
      const timer = setInterval(() => capture("tick"), everyMs);
      return () => clearInterval(timer);
    },
    capture,
    async write(label) {
      await mkdir(paths.snapshots, { recursive: true });
      const path = join(
        paths.snapshots,
        `${label.replace(UNSAFE_LABEL, "_")}.json`,
      );
      await Bun.write(path, `${JSON.stringify(world() ?? null, null, 2)}\n`);
      return path;
    },
  };
}
