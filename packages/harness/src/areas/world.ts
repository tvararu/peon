import type {
  AreaEventOf,
  AreaName,
  AreaState,
  Unsubscribe,
  WorldHandle,
} from "@peon/core";
import type { Frozen } from "#harness/world/service";
import { snapshot } from "#harness/world/snapshot";

export type AreaView<K extends AreaName> = {
  readonly state: () => Frozen<AreaState<K>>;
  readonly onEvent: (cb: (event: AreaEventOf<K>) => void) => Unsubscribe;
};
export type AreaViews = { readonly [K in AreaName]: AreaView<K> };
export type WorldRegistry = Readonly<Record<string, { readonly area: string }>>;
type LooseHandle = {
  readonly state: () => unknown;
  readonly onEvent: (cb: (event: unknown) => void) => Unsubscribe;
};

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
