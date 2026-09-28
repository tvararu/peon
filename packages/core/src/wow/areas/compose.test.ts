import { describe, expect, jest, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import {
  type AreaRuntimes,
  type AreaStores,
  areaHandles,
  buildAreaStores,
  buildModuleStores,
  createAreaRuntimes,
  createModuleRuntimes,
  type LooseModule,
  registerModules,
} from "#wow/areas/compose";
import { emptyStore } from "#wow/areas/contract";
import { type TestPort, testPort } from "#wow/areas/port";
import { FIXTURE_MODULES } from "#wow/areas/typecheck-fixture";
import type { NoticeEvent } from "#wow/client-extras";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { OpcodeDispatch } from "#wow/protocol/world";
import { createWorldEvents } from "#wow/world-events";

const TICK = GameOpcode.SMSG_QUERY_TIME_RESPONSE;
const RING = GameOpcode.SMSG_LOGIN_SETTIMESPEED;
const PEEKED = GameOpcode.SMSG_UPDATE_OBJECT;

type LooseHandle = {
  state: () => unknown;
  onEvent: (cb: (event: unknown) => void) => () => void;
  act: Record<string, (...args: never[]) => unknown>;
};

function tick(count: number): PacketReader {
  const w = new PacketWriter();
  w.uint32LE(count);
  return new PacketReader(w.finish());
}

function ring(bell: string): PacketReader {
  const w = new PacketWriter();
  w.cString(bell);
  return new PacketReader(w.finish());
}

function inline(
  name: string,
  register: LooseModule["register"] = () => undefined,
): LooseModule {
  return {
    name,
    opcodes: { owns: [], uses: [], stubs: [], dead: [], unseen: [] },
    eventTypes: [],
    store: () => emptyStore(),
    register,
  };
}

function session(port: TestPort = testPort()) {
  const core = testStores({ send: port.send });
  const dispatch = new OpcodeDispatch();
  const stores = buildModuleStores(
    {
      getEntity: () => undefined,
      now: port.now,
      selfGuid: port.selfGuid,
      send: port.send,
      updateEntity: () => undefined,
    },
    FIXTURE_MODULES,
    core,
  );
  dispatch.on(PEEKED, () => undefined);
  registerModules(dispatch, FIXTURE_MODULES, stores);
  const lifetime = createModuleRuntimes(port, FIXTURE_MODULES, stores, core);
  const handles = areaHandles(
    stores as AreaStores,
    lifetime.runtimes as AreaRuntimes,
    () => port.events().area,
  ) as unknown as Record<string, LooseHandle>;
  const handle = (name: string): LooseHandle => {
    const found = handles[name];
    if (!found) throw new Error(`no handle ${name}`);
    return found;
  };
  return { dispatch, handle, lifetime, port, stores };
}

function actOf(handle: LooseHandle, name: string) {
  const act = handle.act[name];
  if (!act) throw new Error(`no act ${name}`);
  return act as (...args: unknown[]) => unknown;
}

describe("registerModules", () => {
  test("routes on to the dispatch and applies queued peeks after every module", () => {
    const dispatch = new OpcodeDispatch();
    const seen: string[] = [];
    const peeker = inline("peeker", (wire) =>
      wire.peek(TICK, () => seen.push("peek")),
    );
    const owner = inline("owner", (wire) =>
      wire.on(TICK, () => seen.push("owner")),
    );
    const stores = { owner: emptyStore(), peeker: emptyStore() };
    registerModules(dispatch, [peeker, owner], stores);
    dispatch.handle(TICK, tick(1));
    expect(dispatch.has(TICK)).toBe(true);
    expect(seen).toEqual(["owner", "peek"]);
  });

  test("attaches a peek to a legacy owner registered first", () => {
    const dispatch = new OpcodeDispatch();
    const seen: string[] = [];
    dispatch.on(PEEKED, () => seen.push("legacy"));
    const peeker = inline("peeker", (wire) =>
      wire.peek(PEEKED, () => seen.push("peek")),
    );
    registerModules(dispatch, [peeker], { peeker: emptyStore() });
    dispatch.handle(PEEKED, tick(0));
    expect(seen).toEqual(["legacy", "peek"]);
  });

  test("throws when a peek has no owner", () => {
    const dispatch = new OpcodeDispatch();
    expect(() =>
      registerModules(dispatch, FIXTURE_MODULES, session().stores),
    ).toThrow("peek needs an owner; own the opcode instead");
  });

  test("throws when two modules own one opcode", () => {
    const dispatch = new OpcodeDispatch();
    const first = inline("first", (wire) => wire.on(RING, () => undefined));
    const second = inline("second", (wire) => wire.on(RING, () => undefined));
    const stores = { first: emptyStore(), second: emptyStore() };
    expect(() => registerModules(dispatch, [first, second], stores)).toThrow(
      "already has a handler",
    );
  });
});

describe("inert build", () => {
  test("building every module sends nothing and arms no timer", () => {
    jest.useFakeTimers();
    try {
      const send = () => {
        throw new Error("sent at build");
      };
      const port = testPort({ send });
      const core = testStores({ send });
      const deps = {
        getEntity: () => undefined,
        now: () => 0,
        selfGuid: () => 0n,
        send,
        updateEntity: () => undefined,
      };
      const fixtures = buildModuleStores(deps, FIXTURE_MODULES, core);
      createModuleRuntimes(port, FIXTURE_MODULES, fixtures, core);
      createAreaRuntimes(port, buildAreaStores(deps, core), core);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("fan-in", () => {
  test("the runtime hears an event before the forwarder publishes it", () => {
    const s = session();
    const heard = actOf(s.handle("alpha"), "heard");
    const published: unknown[] = [];
    s.port
      .events()
      .area.subscribe((event) => published.push({ event, heard: heard() }));
    s.dispatch.handle(TICK, tick(5));
    expect(published).toEqual([
      {
        event: { area: "alpha", event: { type: "ticked", count: 5 } },
        heard: ["ticked"],
      },
    ]);
  });

  test("each handle hears only its own area", () => {
    const s = session();
    const alpha: unknown[] = [];
    const beta: unknown[] = [];
    s.handle("alpha").onEvent((event) => alpha.push(event));
    s.handle("beta").onEvent((event) => beta.push(event));
    s.dispatch.handle(TICK, tick(2));
    s.dispatch.handle(RING, ring("noon"));
    expect(alpha).toEqual([{ type: "ticked", count: 2 }]);
    expect(beta).toEqual([{ type: "rang", bell: "noon" }]);
  });

  test("a throwing area listener reaches packetError", () => {
    const errors: [number, Error][] = [];
    const events = createWorldEvents((error) =>
      events.packetError.emit(TICK, error as Error),
    );
    events.packetError.subscribe((opcode, error) =>
      errors.push([opcode, error]),
    );
    const s = session(testPort({ events: () => events }));
    s.port.events().area.subscribe(() => {
      throw new Error("listener broke");
    });
    s.dispatch.handle(TICK, tick(1));
    expect(errors).toEqual([[TICK, new Error("listener broke")]]);
  });

  test("listen subscribes a runtime to a core event", () => {
    const port = testPort();
    const heard: string[] = [];
    const listener: LooseModule = {
      ...inline("listener"),
      runtime: (ctx) => {
        const off = ctx.listen("notice", (event) => heard.push(event.text));
        return { act: {}, dispose: off };
      },
    };
    const core = testStores();
    const stores = { listener: emptyStore() };
    const lifetime = createModuleRuntimes(port, [listener], stores, core);
    const notice: NoticeEvent = {
      type: "not_implemented",
      opcode: RING,
      label: "Game time",
      text: "noticed",
      at: 0,
    };
    port.events().notice.emit(notice);
    lifetime.dispose();
    port.events().notice.emit(notice);
    expect(heard).toEqual(["noticed"]);
  });
});

describe("until", () => {
  test("resolves on a matching event and clears its timer", async () => {
    jest.useFakeTimers();
    try {
      const s = session();
      const pending = actOf(s.handle("alpha"), "wait")(1000);
      s.dispatch.handle(TICK, tick(0));
      s.dispatch.handle(TICK, tick(3));
      await expect(pending).resolves.toEqual({ type: "ticked", count: 3 });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("rejects with timeout and clears its timer", async () => {
    jest.useFakeTimers();
    try {
      const s = session();
      const pending = actOf(s.handle("alpha"), "wait")(50);
      jest.advanceTimersByTime(50);
      await expect(pending).rejects.toThrow("timeout");
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("rejects when its own signal aborts", async () => {
    jest.useFakeTimers();
    try {
      const s = session();
      const abort = new AbortController();
      const pending = actOf(s.handle("alpha"), "wait")(1000, abort.signal);
      abort.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("rejects with the abort reason when the lifetime is disposed", async () => {
    jest.useFakeTimers();
    try {
      const s = session();
      const pending = actOf(s.handle("alpha"), "wait")(1000);
      s.lifetime.dispose();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("handles", () => {
  test("state returns the store snapshot", () => {
    const s = session();
    s.dispatch.handle(TICK, tick(9));
    expect(s.handle("alpha").state()).toEqual({ count: 1 });
    expect(s.handle("beta").state()).toEqual({ count: 0 });
  });

  test("act holds the runtime's acts", () => {
    const s = session();
    actOf(s.handle("alpha"), "ping")();
    expect(s.handle("alpha").act).toBe(s.lifetime.runtimes["alpha"]?.act ?? {});
    expect(s.port.sent).toEqual([
      { opcode: GameOpcode.CMSG_QUERY_TIME, body: new Uint8Array() },
    ]);
  });

  test("a module without a runtime gets no acts", () => {
    const stores = { bare: emptyStore() };
    const lifetime = createModuleRuntimes(
      testPort(),
      [inline("bare")],
      stores,
      testStores(),
    );
    expect(lifetime.runtimes["bare"]?.act).toEqual({});
  });
});
