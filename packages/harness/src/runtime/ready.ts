import {
  type Capabilities,
  CLASS_NAMES,
  type UnitEntity,
  type WorldHandle,
} from "@tuicraft/core";
import type { Profile } from "#harness/contract/config";
import type { Clock, GameLog, ReadyGate } from "#harness/contract/services";
import type { InWorld } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";

export type ReadyInit = {
  clock: Clock;
  log: GameLog;
  profile: Profile;
  stableMs?: number;
};

export const READY_STABLE_MS = 1000;

const POLL_MS = 100;
const NO_CAPABILITIES: Capabilities = {
  factions: false,
  jev: false,
  navigation: false,
  spells: false,
};
const RACE_NAMES: Record<number, string> = {
  1: "Human",
  2: "Orc",
  3: "Dwarf",
  4: "Night Elf",
  5: "Undead",
  6: "Tauren",
  7: "Gnome",
  8: "Troll",
  10: "Blood Elf",
  11: "Draenei",
};

export function createReadyGate(init: ReadyInit): ReadyGate {
  return new Gate(init);
}

class Gate implements ReadyGate {
  private readonly init: ReadyInit;
  private readonly callbacks = new Set<(world: InWorld) => void>();
  private waiters: ((ready: boolean) => void)[] = [];
  private world: InWorld | undefined;

  constructor(init: ReadyInit) {
    this.init = init;
  }

  attach = (handle: WorldHandle) => {
    this.world = undefined;
    const watch = { count: -1, stablePolls: 0 };
    const timer = setInterval(() => this.poll(handle, watch), POLL_MS);
    return () => {
      clearInterval(timer);
      this.world = undefined;
    };
  };

  isReady = () => this.world !== undefined;

  inWorld = () => this.world;

  onReady = (cb: (world: InWorld) => void) => {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  };

  whenReady = (timeoutMs: number): Promise<boolean> => {
    if (this.world) return Promise.resolve(true);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    this.waiters.push((ready) => {
      clearTimeout(timer);
      resolve(ready);
    });
    return promise;
  };

  private poll(
    handle: WorldHandle,
    watch: { count: number; stablePolls: number },
  ): void {
    if (this.world) return;
    const count = handle.getNearbyEntities().length;
    const stablePolls = count === watch.count ? watch.stablePolls + 1 : 0;
    Object.assign(watch, { count, stablePolls });
    const stable =
      stablePolls * POLL_MS >= (this.init.stableMs ?? READY_STABLE_MS);
    if (stable && handle.getControlState().pose)
      this.ready(inWorldOf(handle, this.init.profile, this.init.clock.now()));
  }

  private ready(world: InWorld): void {
    this.world = world;
    const text = `In world as ${world.char}, level ${world.level} ${world.race} ${world.className}, on map ${world.mapId}.`;
    this.init.log.append({
      class: "log",
      data: { ...world },
      domain: "session",
      event: "session/in_world",
      text,
    });
    for (const cb of this.callbacks) cb(world);
    for (const resolve of this.waiters) resolve(true);
    this.waiters = [];
  }
}

function inWorldOf(
  handle: WorldHandle,
  profile: Profile,
  now: number,
): InWorld {
  const { selfGuid, pose } = handle.getControlState();
  const self = handle
    .getNearbyEntities()
    .find(
      (entity): entity is UnitEntity =>
        entity.guid === selfGuid && "class_" in entity,
    );
  const place = attempt(() => handle.getPlaceState());
  const at = {
    mapId: pose?.mapId ?? 0,
    x: pose?.x ?? 0,
    y: pose?.y ?? 0,
    z: pose?.z ?? 0,
  };
  return {
    account: profile.account,
    at: now,
    capabilities: attempt(() => handle.capabilities()) ?? NO_CAPABILITIES,
    char: self?.name ?? profile.character,
    className: CLASS_NAMES[self?.class_ ?? 0] ?? "unknown",
    guid: guidHex(selfGuid),
    level: self?.level ?? 0,
    mapId: at.mapId,
    pose: at,
    race: RACE_NAMES[self?.race ?? 0] ?? "unknown",
    zone: place?.zone,
    zoneId: place?.zoneId,
  };
}

function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
