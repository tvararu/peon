import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  buildModuleStores,
  createModuleRuntimes,
  type LooseModule,
} from "#wow/areas/compose";
import {
  type AreaEventBase,
  type AreaOpcodes,
  type AreaRuntime,
  defineArea,
  type StoreEvent,
  type StoreState,
} from "#wow/areas/contract";
import type { AreaPort } from "#wow/areas/port";
import type { CoreHandle } from "#wow/client";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

type AlphaEvent = { readonly type: "ticked"; readonly count: number };
type BetaEvent = { readonly type: "rang"; readonly bell: string };

const ALPHA_OPCODES = {
  owns: ["SMSG_QUERY_TIME_RESPONSE", "CMSG_QUERY_TIME"],
  uses: ["SMSG_UPDATE_OBJECT"],
  stubs: [],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;

const BETA_OPCODES = {
  owns: ["SMSG_LOGIN_SETTIMESPEED"],
  uses: [],
  stubs: [["SMSG_LOGIN_SETTIMESPEED", "Fixture time"]],
  dead: [],
  unseen: [],
} as const satisfies AreaOpcodes;

function pushStore<E extends AreaEventBase>() {
  const emitter = new Emitter<[E]>();
  let count = 0;
  return {
    snapshot: () => ({ count }),
    onEvent: (cb: (event: E) => void): Unsubscribe => emitter.subscribe(cb),
    dispose: () => emitter.clear(),
    push(event: E): void {
      count += 1;
      emitter.emit(event);
    },
  };
}

const alpha = defineArea({
  name: "alpha",
  opcodes: ALPHA_OPCODES,
  eventTypes: ["ticked"],
  store: () => pushStore<AlphaEvent>(),
  register: (wire, store) => {
    wire.on(GameOpcode[ALPHA_OPCODES.owns[0]], (reader) =>
      store.push({ type: "ticked", count: reader.uint32LE() }),
    );
    wire.peek(GameOpcode[ALPHA_OPCODES.uses[0]], () => undefined);
  },
  runtime: (ctx, store) => {
    const heard: string[] = [];
    const off = store.onEvent((event) => heard.push(event.type));
    const ping = () => ctx.send(GameOpcode[ALPHA_OPCODES.owns[1]]);
    const wait = (timeoutMs: number, signal?: AbortSignal) =>
      ctx.until((event) => event.type === "ticked" && event.count > 0, {
        timeoutMs,
        signal,
      });
    return { act: { heard: () => [...heard], ping, wait }, dispose: off };
  },
});

const beta = defineArea({
  name: "beta",
  opcodes: BETA_OPCODES,
  eventTypes: ["rang"],
  store: () => pushStore<BetaEvent>(),
  register: (wire, store) => {
    wire.on(GameOpcode[BETA_OPCODES.owns[0]], (reader) =>
      store.push({ type: "rang", bell: reader.cString() }),
    );
  },
  runtime: (ctx) => ({
    act: { ring: (bell: string) => ctx.send(bell.length) },
    dispose: () => undefined,
  }),
});

export const FIXTURE_AREAS = { alpha, beta };

type Fixtures = typeof FIXTURE_AREAS;
type FixtureName = keyof Fixtures & string;
type FixtureState<K extends FixtureName> = StoreState<
  ReturnType<Fixtures[K]["store"]>
>;
type FixtureEventOf<K extends FixtureName> = StoreEvent<
  ReturnType<Fixtures[K]["store"]>
>;
type FixtureActsOf<K extends FixtureName> =
  NonNullable<Fixtures[K]["runtime"]> extends (
    ...args: never[]
  ) => AreaRuntime<infer A>
    ? A
    : never;
type FixtureEvent = {
  [K in FixtureName]: {
    readonly area: K;
    readonly event: FixtureEventOf<K>;
  };
}[FixtureName];
type FixtureStores = {
  readonly [K in FixtureName]: ReturnType<Fixtures[K]["store"]>;
};
type FixtureRuntimes = {
  readonly [K in FixtureName]: AreaRuntime<FixtureActsOf<K>>;
};
type FixtureHandle<K extends FixtureName> = {
  readonly state: () => FixtureState<K>;
  readonly onEvent: (cb: (event: FixtureEventOf<K>) => void) => Unsubscribe;
  readonly act: FixtureActsOf<K>;
};
type FixtureHandles = { readonly [K in FixtureName]: FixtureHandle<K> };
type NameFree<N extends string> = [
  Extract<N, keyof CoreHandle | "onAreaEvent">,
] extends [never]
  ? true
  : never;
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

function fixtureLoose(module: Fixtures[FixtureName]): LooseModule {
  return module as LooseModule;
}

export const FIXTURE_MODULES: readonly LooseModule[] =
  Object.values(FIXTURE_AREAS).map(fixtureLoose);

export function fixtureStores(
  deps: SessionDeps,
  core: CoreStores,
): FixtureStores {
  return buildModuleStores(deps, FIXTURE_MODULES, core) as FixtureStores;
}

export function fixtureRuntimes(
  port: AreaPort,
  stores: FixtureStores,
  core: CoreStores,
): { runtimes: FixtureRuntimes; dispose: () => void } {
  const built = createModuleRuntimes(port, FIXTURE_MODULES, stores, core);
  return {
    runtimes: built.runtimes as FixtureRuntimes,
    dispose: built.dispose,
  };
}

export function fixtureHandles(
  stores: FixtureStores,
  runtimes: FixtureRuntimes,
  area: () => Emitter<[FixtureEvent]>,
): FixtureHandles {
  const handle = <K extends FixtureName>(name: K): FixtureHandle<K> => ({
    state: () => stores[name].snapshot() as FixtureState<K>,
    onEvent: (cb) =>
      area().subscribe((event) => {
        if (event.area === name) cb(event.event as FixtureEventOf<K>);
      }),
    act: runtimes[name].act,
  });
  return { alpha: handle("alpha"), beta: handle("beta") };
}

export const FIXTURE_TYPE_CHECKS = {
  names: true,
  alphaState: true,
  alphaEvent: true,
  betaEvent: true,
  alphaActs: true,
  alphaWait: true,
  betaActs: true,
  event: true,
  free: true,
  haltClashes: true,
} satisfies {
  names: Same<FixtureName, "alpha" | "beta">;
  alphaState: Same<FixtureState<"alpha">, { count: number }>;
  alphaEvent: Same<FixtureEventOf<"alpha">, AlphaEvent>;
  betaEvent: Same<FixtureEventOf<"beta">, BetaEvent>;
  alphaActs: Same<keyof FixtureActsOf<"alpha">, "heard" | "ping" | "wait">;
  alphaWait: Same<
    ReturnType<FixtureActsOf<"alpha">["wait"]>,
    Promise<AlphaEvent>
  >;
  betaActs: Same<Parameters<FixtureActsOf<"beta">["ring"]>, [bell: string]>;
  event: Same<
    FixtureEvent,
    | { readonly area: "alpha"; readonly event: AlphaEvent }
    | { readonly area: "beta"; readonly event: BetaEvent }
  >;
  free: NameFree<FixtureName>;
  haltClashes: [NameFree<"halt" | FixtureName>] extends [never] ? true : false;
};
