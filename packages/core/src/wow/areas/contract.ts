import type { Emitter, Unsubscribe } from "#lib/emitter";
import type { DbcSource } from "#wow/dbc";
import type { FriendEntry } from "#wow/friend-store";
import type { GuildRoster } from "#wow/guild-store";
import type { IgnoreEntry } from "#wow/ignore-store";
import type { PartyState } from "#wow/party-store";
import type { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import type { ExpectOptions } from "#wow/protocol/world";
import type { CoreStores, SessionDeps } from "#wow/session-stores";
import type { CoreEvents } from "#wow/world-events";

export type OpcodeName = keyof typeof GameOpcode;
export type AreaEventBase = { readonly type: string };

export type AreaOpcodes = {
  readonly owns: readonly OpcodeName[];
  readonly uses: readonly OpcodeName[];
  readonly stubs: readonly (readonly [name: OpcodeName, label: string])[];
  readonly dead: readonly OpcodeName[];
  readonly unseen: readonly OpcodeName[];
};

export type AreaStore<S, E extends AreaEventBase> = {
  snapshot: () => S;
  onEvent: (cb: (event: E) => void) => Unsubscribe;
  dispose: () => void;
};
export type AnyStore = AreaStore<unknown, AreaEventBase>;
export type StoreState<St extends AnyStore> = ReturnType<St["snapshot"]>;
export type StoreEvent<St extends AnyStore> = Parameters<
  Parameters<St["onEvent"]>[0]
>[0];

export type Read = (reader: PacketReader) => void;
export type AreaRegister = {
  on: (opcode: number, read: Read) => void;
  peek: (opcode: number, read: Read) => void;
};

export type Listener<K extends keyof CoreEvents> =
  CoreEvents[K] extends Emitter<infer A> ? (...args: A) => void : never;

export type LegacyViews = {
  party: () => PartyState;
  friends: () => readonly FriendEntry[];
  ignored: () => readonly IgnoreEntry[];
  guild: () => GuildRoster | undefined;
  channels: () => readonly string[];
};

export type AreaRuntimeCtx<E extends AreaEventBase> = {
  send: (opcode: number, body?: Uint8Array) => void;
  expect: (opcode: number, options?: ExpectOptions) => Promise<PacketReader>;
  listen: <K extends keyof CoreEvents>(name: K, cb: Listener<K>) => Unsubscribe;
  until: (
    match: (event: E) => boolean,
    options: { timeoutMs: number; signal?: AbortSignal },
  ) => Promise<E>;
  now: () => number;
  selfGuid: () => bigint;
  signal: AbortSignal;
  dbc: DbcSource | undefined;
  legacy: LegacyViews;
};

export type AreaActs = Readonly<Record<string, (...args: never[]) => unknown>>;
export type AreaRuntime<A extends AreaActs> = {
  readonly act: A;
  dispose: () => void;
};

export type AreaModule<
  N extends string,
  St extends AnyStore,
  A extends AreaActs,
> = {
  readonly name: N;
  readonly opcodes: AreaOpcodes;
  readonly eventTypes: readonly StoreEvent<St>["type"][];
  store: (deps: SessionDeps, core: CoreStores) => St;
  register: (wire: AreaRegister, store: St) => void;
  runtime?: (
    ctx: AreaRuntimeCtx<StoreEvent<St>>,
    store: St,
    core: CoreStores,
  ) => AreaRuntime<A>;
};

export function defineArea<
  N extends string,
  St extends AnyStore,
  A extends AreaActs = Readonly<Record<never, never>>,
>(module: AreaModule<N, St, A>): AreaModule<N, St, A> {
  return module;
}

export function emptyStore(): AreaStore<Readonly<Record<never, never>>, never> {
  return {
    snapshot: () => ({}),
    onEvent: () => () => undefined,
    dispose: () => undefined,
  };
}
