import { testStores } from "#test-support/session-fixtures";
import {
  type AreaHandle,
  type AreaName,
  type AreaRuntimes,
  type AreaStores,
  areaHandles,
  createModuleRuntimes,
  looseModule,
  registerModules,
} from "#wow/areas/compose";
import { type SentPacket, testPort } from "#wow/areas/port";
import { AREAS } from "#wow/areas/registry";
import type { DbcSource } from "#wow/dbc";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { OpcodeDispatch } from "#wow/protocol/world";
import { disposeSessionStores, type SessionStores } from "#wow/session-stores";
import type { WorldEvents } from "#wow/world-events";

export type AreaRig<K extends AreaName> = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<K>;
  sent: readonly SentPacket[];
  events: WorldEvents;
  inject: (opcode: number, body: Uint8Array) => void;
  dispose: () => void;
};

type RigInit = {
  now?: () => number;
  selfGuid?: bigint;
  dbc?: DbcSource;
  register?: (dispatch: OpcodeDispatch, stores: SessionStores) => void;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function areaRig<K extends AreaName>(
  name: K,
  init: RigInit = {},
): AreaRig<K> {
  const module = looseModule(AREAS[name]);
  const dispatch = new OpcodeDispatch();
  const guid = init.selfGuid ?? 0n;
  const port = testPort({
    dbc: init.dbc,
    expect: (opcode, options) => dispatch.expect(opcode, options),
    now: init.now ?? (() => 0),
    selfGuid: () => guid,
  });
  const events = port.events();
  const stores = testStores({
    now: port.now,
    selfGuid: port.selfGuid,
    send: port.send,
  });
  dispatch.onPeekError((opcode, error) =>
    events.packetError.emit(opcode, asError(error)),
  );
  init.register?.(dispatch, stores);
  for (const use of module.opcodes.uses)
    if (!dispatch.has(GameOpcode[use]))
      dispatch.on(GameOpcode[use], () => undefined);
  const own = { [name]: stores.areas[name] };
  registerModules(dispatch, [module], own);
  const lifetime = createModuleRuntimes(port, [module], own, stores);
  const handles = areaHandles(
    own as unknown as AreaStores,
    lifetime.runtimes as AreaRuntimes,
    () => events.area,
  );
  return {
    dispatch,
    dispose() {
      lifetime.dispose();
      disposeSessionStores(stores);
    },
    events,
    handle: handles[name],
    inject: (opcode, body) =>
      void dispatch.handle(opcode, new PacketReader(body)),
    sent: port.sent,
    stores,
  };
}
