import { describe, expect, jest, test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { Refusal } from "#harness/ops/refusal";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { barState } from "#test-support/pets-command-fixture";
import type { TestRuntime } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";

const MASTER = 0x40n;
const NAME = "Paniar";

type Listed = {
  number: number;
  entry: number;
  level: number;
  name: string;
  state: "active" | "stabled" | "unknown";
};
type Stable = { npc: bigint; slots: number; pets: Listed[]; stale: boolean };
type Reply =
  | "stabled"
  | "unstabled"
  | "slot_bought"
  | "money"
  | "refused"
  | "exotic"
  | "unknown";

const FANG: Listed = {
  entry: 1,
  level: 10,
  name: "Fang",
  number: 7,
  state: "active",
};
const RIP: Listed = {
  entry: 2,
  level: 12,
  name: "Rip",
  number: 9,
  state: "stabled",
};
const SNAP: Listed = {
  entry: 3,
  level: 11,
  name: "Rip",
  number: 11,
  state: "stabled",
};

type World = {
  list: { mock: { calls: unknown[][] } } & ((...a: never[]) => unknown);
  make: (
    name: "stablePet" | "swapStabledPet" | "unstablePet" | "buyStableSlot",
    result: Reply | "none",
  ) => void;
  sent: string[];
  t: TestRuntime;
};

async function world(init: {
  bar: boolean;
  stable: Stable | undefined;
  silent?: boolean;
}): Promise<World> {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: MASTER,
      name: NAME,
      relation: "friendly",
      roles: ["stable_master", "gossip"],
      x: 3,
      y: 0,
    }),
  ]);
  t.handle.cancelInteraction = () => undefined;
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    } as never);
  const bar = init.bar ? barState().bar : undefined;
  const stable = init.stable;
  Object.assign(t.handle.pets, {
    state: () => ({ ...barState(), bar, stable }),
  });
  const sent: string[] = [];
  const reply = (type: string, extra: object) =>
    t.handle.triggerAreaEvent("pets", { type, ...extra } as never);
  const answered = (outcome: Reply | "none") => () => {
    if (outcome === "none") reply("unanswered", { request: "stable" });
    else reply("stable_result", { code: 0, result: outcome });
    return { ok: true } as const;
  };
  const act = t.handle.pets.act;
  const make: World["make"] = (name, outcome) =>
    void jest.spyOn(act, name).mockImplementation(((...args: unknown[]) => {
      sent.push(`${name}:${args.join(",")}`);
      return answered(outcome)();
    }) as never);
  const list = jest.spyOn(act, "listStabledPets").mockImplementation(((
    npc: bigint,
  ) => {
    sent.push(`list:${npc}`);
    if (!init.silent) reply("stable_list", { stable: init.stable ?? FULL });
    return { ok: true };
  }) as never);
  return { list: list as never, make, sent, t };
}

const FULL: Stable = { npc: MASTER, pets: [FANG, RIP], slots: 2, stale: false };

function run(t: TestRuntime, args: object) {
  return interactSpec.run(
    { npc: NAME, ...args } as never,
    toolCtx<InteractAfter>(t),
  );
}

describe("interact at a stable master", () => {
  test("talk lists the pet out, the stabled pets and the free slots", async () => {
    const w = await world({ bar: true, stable: FULL });
    const out = await run(w.t, {});
    const text = contentOf(out);
    expect(w.list).toHaveBeenCalledWith(MASTER);
    expect(text).toContain("Rip");
    expect(text).toContain("Fang");
    expect(text).toContain("1 of 2 slots free");
    expect(text).not.toContain("Not a vendor or trainer");
  });

  test("stable sends the stable request and is DONE on stabled", async () => {
    const w = await world({ bar: true, stable: FULL });
    w.make("stablePet", "stabled");
    const out = await run(w.t, { do: "stable" });
    expect(out.status).toBe("DONE");
    expect(w.sent).toContain(`stablePet:${MASTER}`);
  });

  test("stable without a pet out refuses and sends nothing", async () => {
    const w = await world({ bar: false, stable: FULL });
    w.make("stablePet", "stabled");
    const failure = await run(w.t, { do: "stable" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Refusal);
    expect(w.sent.filter((s) => s.startsWith("stablePet"))).toEqual([]);
  });

  test("buy_slot maps the reply codes", async () => {
    const cases: [Reply | "none", string, string | undefined][] = [
      ["slot_bought", "DONE", undefined],
      ["money", "FAILED", "money"],
      ["refused", "FAILED", "refused"],
      ["exotic", "FAILED", "exotic"],
      ["none", "UNCONFIRMED", undefined],
    ];
    for (const [reply, status, reason] of cases) {
      const w = await world({ bar: true, stable: FULL });
      w.make("buyStableSlot", reply);
      const out = await run(w.t, { do: "buy_slot" }).catch((e: unknown) => e);
      const got = out instanceof Refusal ? out : out;
      const settled = got as { status?: string; reason?: string };
      expect(settled.status).toBe(status);
      if (reason) expect(settled.reason).toBe(reason);
      expect(w.sent).toContain(`buyStableSlot:${MASTER}`);
    }
  });

  test("unstable by name with no pet out sends unstable", async () => {
    const w = await world({ bar: false, stable: FULL });
    w.make("unstablePet", "unstabled");
    const out = await run(w.t, { do: "unstable", what: "rip" });
    expect(out.status).toBe("DONE");
    expect(w.sent).toContain(`unstablePet:${MASTER},9`);
  });

  test("unstable with a pet out swaps", async () => {
    const w = await world({ bar: true, stable: FULL });
    w.make("swapStabledPet", "unstabled");
    const out = await run(w.t, { do: "unstable", what: "9" });
    expect(out.status).toBe("DONE");
    expect(w.sent).toContain(`swapStabledPet:${MASTER},9`);
    expect(w.sent.some((s) => s.startsWith("unstablePet"))).toBe(false);
  });

  test("unstable with an unknown name refuses and names the stabled pets", async () => {
    const w = await world({ bar: false, stable: FULL });
    w.make("unstablePet", "unstabled");
    const failure = await run(w.t, { do: "unstable", what: "Zed" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Refusal);
    expect(String((failure as Refusal).body.join("\n"))).toContain("Rip");
    expect(w.sent.filter((s) => s.startsWith("unstablePet"))).toEqual([]);
  });

  test("two stabled pets with the same name need the number", async () => {
    const both: Stable = { ...FULL, pets: [RIP, SNAP], slots: 2 };
    const w = await world({ bar: false, stable: both });
    w.make("unstablePet", "unstabled");
    const failure = await run(w.t, { do: "unstable", what: "Rip" }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(Refusal);
    expect(w.sent.filter((s) => s.startsWith("unstablePet"))).toEqual([]);
    const ok = await run(w.t, { do: "unstable", what: "11" });
    expect(ok.status).toBe("DONE");
    expect(w.sent).toContain(`unstablePet:${MASTER},11`);
  });

  test("unstable reads the list first when none is known", async () => {
    const w = await world({ bar: false, stable: undefined });
    w.make("unstablePet", "unstabled");
    const out = await run(w.t, { do: "unstable", what: "rip" });
    expect(out.status).toBe("DONE");
    expect(w.sent[0]).toBe(`list:${MASTER}`);
    expect(w.sent).toContain(`unstablePet:${MASTER},9`);
  });

  test("a silent server refuses unstable with no listing", async () => {
    await withFakeTimers(async () => {
      const w = await world({ bar: false, silent: true, stable: undefined });
      const pending = run(w.t, { do: "unstable", what: "Rip" }).then(
        () => undefined,
        (e: unknown) => e,
      );
      await elapse(6000);
      expect(await pending).toBeInstanceOf(Refusal);
    });
  });

  test("an unknown stable code fails as unknown_result", async () => {
    const w = await world({ bar: true, stable: FULL });
    w.make("buyStableSlot", "unknown");
    const out = await run(w.t, { do: "buy_slot" });
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("unknown_result");
  });

  test("an exotic reply names the exotic reason", async () => {
    const w = await world({ bar: false, stable: FULL });
    w.make("unstablePet", "exotic");
    const out = await run(w.t, { do: "unstable", what: "rip" });
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("exotic");
  });

  test("a list reply for another master is ignored", async () => {
    const w = await world({ bar: false, stable: FULL });
    w.make("unstablePet", "unstabled");
    const caller = run(w.t, { do: "unstable", what: "rip" });
    w.t.handle.triggerAreaEvent("pets", {
      npc: 0x99n,
      pets: [],
      slots: 0,
      stale: false,
      type: "stable_list",
    } as never);
    const out = await caller;
    expect(out.status).toBe("DONE");
    expect(w.sent).toContain(`unstablePet:${MASTER},9`);
  });

  test("a stable aborted behind the mutex sends nothing", async () => {
    const w = await world({ bar: true, stable: FULL });
    w.make("stablePet", "stabled");
    const gate = Promise.withResolvers<void>();
    const held = w.t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const pending = interactSpec
      .run(
        { do: "stable", npc: NAME } as never,
        toolCtx<InteractAfter>(w.t, controller.signal),
      )
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    await Promise.resolve();
    controller.abort();
    gate.resolve();
    await held;
    await pending;
    expect(w.sent.filter((s) => s.startsWith("stablePet"))).toEqual([]);
  });
});
