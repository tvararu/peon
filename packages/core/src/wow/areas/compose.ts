import { abortReason } from "#lib/abort";
import type { Emitter, Unsubscribe } from "#lib/emitter";
import type {
  AnyStore,
  AreaActs,
  AreaEventBase,
  AreaOpcodes,
  AreaRegister,
  AreaRuntime,
  AreaRuntimeCtx,
  Listener,
  Read,
  StoreEvent,
  StoreState,
} from "#wow/areas/contract";
import type { AreaPort } from "#wow/areas/port";
import { AREAS } from "#wow/areas/registry";
import type { CoreHandle } from "#wow/client";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { OpcodeDispatch } from "#wow/protocol/world";
import type { CoreStores, SessionDeps } from "#wow/session-stores";
import type { CoreEvents } from "#wow/world-events";

type Areas = typeof AREAS;
type StoreOf<K extends AreaName> =
  ReturnType<Areas[K]["store"]> extends infer St extends AnyStore ? St : never;

export type AreaName = keyof Areas & string;
export type AreaState<K extends AreaName> = StoreState<StoreOf<K>>;
export type AreaEventOf<K extends AreaName> = StoreEvent<StoreOf<K>>;
export type AreaActsOf<K extends AreaName> =
  NonNullable<Areas[K]["runtime"]> extends (
    ...args: never[]
  ) => AreaRuntime<infer A>
    ? A
    : never;
export type AreaEvent = {
  [K in AreaName]: { readonly area: K; readonly event: AreaEventOf<K> };
}[AreaName];
export type AreaStores = {
  readonly [K in AreaName]: ReturnType<Areas[K]["store"]>;
};
export type AreaRuntimes = {
  readonly [K in AreaName]: AreaRuntime<AreaActsOf<K>>;
};
export type AreaLifetime = {
  readonly runtimes: AreaRuntimes;
  dispose: () => void;
};
export type AreaHandle<K extends AreaName> = {
  readonly state: () => AreaState<K>;
  readonly onEvent: (cb: (event: AreaEventOf<K>) => void) => Unsubscribe;
  readonly act: AreaActsOf<K>;
};
export type AreaHandles = { readonly [K in AreaName]: AreaHandle<K> };
export type StubEntry = readonly [opcode: number, label: string];

export type LooseModule = {
  readonly name: string;
  readonly opcodes: AreaOpcodes;
  readonly eventTypes: readonly string[];
  store: (deps: SessionDeps, core: CoreStores) => AnyStore;
  register: (wire: AreaRegister, store: unknown) => void;
  runtime?: (
    ctx: AreaRuntimeCtx<AreaEventBase>,
    store: unknown,
    core: CoreStores,
  ) => AreaRuntime<AreaActs>;
};

type LooseEvent = { readonly area: string; readonly event: AreaEventBase };
type LooseStores = Readonly<Record<string, AnyStore>>;
type LooseRuntimes = Readonly<Record<string, AreaRuntime<AreaActs>>>;
type UntilOptions = { timeoutMs: number; signal?: AbortSignal };

function isAreaName(name: string): name is AreaName {
  return name in AREAS;
}

export const AREA_NAMES: readonly AreaName[] =
  Object.keys(AREAS).filter(isAreaName);

export const AREA_NAMES_FREE: [
  Extract<AreaName, keyof CoreHandle | "onAreaEvent">,
] extends [never]
  ? true
  : never = true;

export function looseModule(module: Areas[AreaName]): LooseModule {
  return module as LooseModule;
}

function areaModules(): LooseModule[] {
  return AREA_NAMES.map((name) => looseModule(AREAS[name]));
}

function pick<T>(record: Readonly<Record<string, T>>, name: string): T {
  const value = record[name];
  if (value === undefined) throw new Error(`no area named ${name}`);
  return value;
}

export function registerModules(
  dispatch: OpcodeDispatch,
  modules: readonly LooseModule[],
  stores: LooseStores,
): void {
  const peeks: [opcode: number, read: Read][] = [];
  const wire: AreaRegister = {
    on: (opcode, read) => dispatch.on(opcode, read),
    peek: (opcode, read) => {
      peeks.push([opcode, read]);
    },
  };
  for (const module of modules)
    module.register(wire, pick(stores, module.name));
  for (const [opcode, read] of peeks) dispatch.peek(opcode, read);
}

export function buildModuleStores(
  deps: SessionDeps,
  modules: readonly LooseModule[],
  core: CoreStores,
): Record<string, AnyStore> {
  return Object.fromEntries(
    modules.map((module) => [module.name, module.store(deps, core)]),
  );
}

function waitFor(store: AnyStore, lifetime: AbortSignal) {
  return (match: (event: AreaEventBase) => boolean, options: UntilOptions) =>
    new Promise<AreaEventBase>((resolve, reject) => {
      const signals = [lifetime, options.signal].filter((s) => s !== undefined);
      const aborted = signals.find((s) => s.aborted);
      if (aborted) return reject(abortReason(aborted));
      const aborts = signals.map((signal) => ({
        signal,
        abort: () => settle(() => reject(abortReason(signal))),
      }));
      const off = store.onEvent((event) => {
        if (match(event)) settle(() => resolve(event));
      });
      const timer = setTimeout(
        () => settle(() => reject(new Error("timeout"))),
        options.timeoutMs,
      );
      function settle(finish: () => void): void {
        clearTimeout(timer);
        off();
        for (const { signal, abort } of aborts)
          signal.removeEventListener("abort", abort);
        finish();
      }
      for (const { signal, abort } of aborts)
        signal.addEventListener("abort", abort, { once: true });
    });
}

function runtimeCtx(
  port: AreaPort,
  store: AnyStore,
  signal: AbortSignal,
): AreaRuntimeCtx<AreaEventBase> {
  return {
    send: (opcode, body) => port.send(opcode, body),
    expect: (opcode, options) => port.expect(opcode, options),
    listen: <K extends keyof CoreEvents>(name: K, cb: Listener<K>) =>
      port.events()[name].subscribe(cb as never),
    until: waitFor(store, signal),
    now: () => port.now(),
    selfGuid: () => port.selfGuid(),
    signal,
    dbc: port.dbc,
    legacy: port.legacy,
  };
}

const NO_RUNTIME: AreaRuntime<AreaActs> = {
  act: {},
  dispose: () => undefined,
};

export function createModuleRuntimes(
  port: AreaPort,
  modules: readonly LooseModule[],
  stores: LooseStores,
  core: CoreStores,
): { runtimes: Record<string, AreaRuntime<AreaActs>>; dispose: () => void } {
  const lifetime = new AbortController();
  const runtimes: Record<string, AreaRuntime<AreaActs>> = {};
  const forwarders: Unsubscribe[] = [];
  for (const { name, runtime } of modules) {
    const store = pick(stores, name);
    const ctx = runtimeCtx(port, store, lifetime.signal);
    runtimes[name] = runtime?.(ctx, store, core) ?? NO_RUNTIME;
    const forward = (event: AreaEventBase) =>
      port.events().area.emit({ area: name, event } as AreaEvent);
    forwarders.push(store.onEvent(forward));
  }
  return {
    runtimes,
    dispose() {
      lifetime.abort();
      for (const off of forwarders) off();
      for (const runtime of Object.values(runtimes)) runtime.dispose();
    },
  };
}

export function registerAreas(
  dispatch: OpcodeDispatch,
  stores: AreaStores,
): void {
  registerModules(dispatch, areaModules(), stores);
}

export function buildAreaStores(
  deps: SessionDeps,
  core: CoreStores,
): AreaStores {
  return buildModuleStores(deps, areaModules(), core) as AreaStores;
}

export function disposeAreaStores(stores: AreaStores): void {
  for (const store of Object.values<AnyStore>(stores)) store.dispose();
}

export function createAreaRuntimes(
  port: AreaPort,
  stores: AreaStores,
  core: CoreStores,
): AreaLifetime {
  const built = createModuleRuntimes(port, areaModules(), stores, core);
  return { runtimes: built.runtimes as AreaRuntimes, dispose: built.dispose };
}

function moduleHandle(
  name: string,
  store: AnyStore,
  runtime: AreaRuntime<AreaActs>,
  area: () => Emitter<[AreaEvent]>,
) {
  return {
    state: () => store.snapshot(),
    onEvent: (cb: (event: AreaEventBase) => void) =>
      area().subscribe((event: LooseEvent) => {
        if (event.area === name) cb(event.event);
      }),
    act: runtime.act,
  };
}

export function areaHandles(
  stores: AreaStores,
  runtimes: AreaRuntimes,
  area: () => Emitter<[AreaEvent]>,
): AreaHandles {
  const loose = runtimes as LooseRuntimes;
  const entries = Object.entries<AnyStore>(stores).map(([name, store]) => [
    name,
    moduleHandle(name, store, pick(loose, name), area),
  ]);
  return Object.fromEntries(entries) as AreaHandles;
}

export function areaStubs(): StubEntry[] {
  return areaModules().flatMap(({ opcodes }) =>
    opcodes.stubs.map(([name, label]): StubEntry => [GameOpcode[name], label]),
  );
}

export function stubOwners(): ReadonlyMap<number, AreaName> {
  return new Map(
    areaModules().flatMap(({ name, opcodes }) =>
      opcodes.stubs.map(([stub]) => [GameOpcode[stub], name as AreaName]),
    ),
  );
}
