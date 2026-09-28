import type {
  AreaActsOf,
  AreaEventOf,
  AreaName,
  AreaState,
  Unsubscribe,
  WorldHandle,
} from "@peon/core";
import type { HARNESS_AREAS } from "#harness/areas/registry";
import type { Frozen, Sender, WorldRefusal } from "#harness/world/service";
import { snapshot } from "#harness/world/snapshot";

export type WorldActName<K extends AreaName> =
  (typeof HARNESS_AREAS)[K]["worldActs"][number];
export type AreaView<K extends AreaName> = {
  readonly state: () => Frozen<AreaState<K>>;
  readonly onEvent: (cb: (event: AreaEventOf<K>) => void) => Unsubscribe;
};
export type AreaViews = { readonly [K in AreaName]: AreaView<K> };
export type AreaClaimActs = {
  readonly [K in AreaName]: {
    readonly [A in WorldActName<K>]: Sender<AreaActsOf<K>[A]>;
  };
};

export type WorldRegistry = Readonly<
  Record<string, { readonly worldActs: readonly string[] }>
>;
type LooseAct = (...args: unknown[]) => unknown;
type ActsOf<K> = K extends AreaName
  ? AreaActsOf<K>
  : Readonly<Record<string, LooseAct>>;
type RegistryActs<R extends WorldRegistry> = {
  readonly [K in keyof R]: {
    readonly [A in R[K]["worldActs"][number]]: A extends keyof ActsOf<K>
      ? Sender<ActsOf<K>[A]>
      : never;
  };
};
type LooseHandle = {
  readonly state: () => unknown;
  readonly onEvent: (cb: (event: unknown) => void) => Unsubscribe;
  readonly act: Readonly<Record<string, LooseAct>>;
};
type Guard = <T>(act: () => Promise<T>) => Promise<T>;

function areaOf(handle: WorldHandle, area: string): LooseHandle {
  const found = (handle as unknown as Readonly<Record<string, LooseHandle>>)[
    area
  ];
  if (!found) throw new Error(`no area named ${area}`);
  return found;
}

function view(
  handle: WorldHandle,
  area: string,
  hold: (off: Unsubscribe) => void,
) {
  return Object.freeze({
    onEvent(cb: (event: unknown) => void): Unsubscribe {
      let live = true;
      const off = areaOf(handle, area).onEvent((event) => cb(snapshot(event)));
      const stop = () => {
        if (!live) return;
        live = false;
        off();
      };
      hold(stop);
      return stop;
    },
    state: () => snapshot(areaOf(handle, area).state()),
  });
}

export function areaViews(
  registry: WorldRegistry,
  handle: WorldHandle,
  hold: (off: Unsubscribe) => void,
): AreaViews {
  const views = Object.keys(registry).map((area) => [
    area,
    view(handle, area, hold),
  ]);
  return Object.freeze(Object.fromEntries(views)) as AreaViews;
}

function acts(
  area: string,
  names: readonly string[],
  handle: () => WorldHandle | undefined,
  guard: Guard,
) {
  const send =
    (name: string) =>
    (...args: unknown[]) =>
      guard(
        () =>
          new Promise<unknown>((resolve) => {
            const live = handle();
            if (!live) throw new Error("offline" satisfies WorldRefusal);
            const act = areaOf(live, area).act[name];
            if (!act) throw new Error(`no act ${area}.${name}`);
            resolve(act(...args));
          }),
      );
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, send(name)])),
  );
}

export function areaActs<R extends WorldRegistry>(
  registry: R,
  handle: () => WorldHandle | undefined,
  guard: Guard,
): RegistryActs<R> {
  const all = Object.entries(registry).map(([area, module]) => [
    area,
    acts(area, module.worldActs, handle, guard),
  ]);
  return Object.freeze(Object.fromEntries(all)) as RegistryActs<R>;
}
