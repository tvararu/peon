import { describe, expect, jest, test } from "bun:test";
import type { AreaActsOf, AreaState, SpellDefinition } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { spellSpec } from "#harness/areas/spells/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  combatEvent,
  definition,
  FROST_ARMOR_SPELL,
  type SpellWorld,
  type SpellWorldInit,
  spellWorld,
} from "#test-support/spell-tool-fixtures";

const SELF_GUID = 0x2an;
const MOUNTED_AURA = 78;
const MOUNTED_SPEED_AURA = 32;
const FLIGHT_AURA = 207;

const IDLE: AreaState<"selfstate"> = {
  collisionHeight: undefined,
  condition: {
    drunkState: "sober",
    drunkValue: 0,
    restedXp: 0,
    resting: false,
    restState: "unknown",
  },
  ghostPending: false,
  lastTransferAbort: undefined,
  mountDisplayId: 0,
  mounted: false,
  selfResSpell: 0,
  standState: "stand",
  timers: {},
};

type MountInit = { speed?: number; flying?: boolean };

function mount(id: number, name: string, init: MountInit = {}) {
  const base = definition({ aura: MOUNTED_AURA, id, name });
  const [first] = base.effects;
  if (!first) throw new Error("fixture has no effect");
  const extra = (applyAura: number, basePoints: number) => ({
    ...first,
    applyAura,
    basePoints,
    effect: 6,
  });
  const effects = [first];
  if (init.speed !== undefined)
    effects.push(extra(MOUNTED_SPEED_AURA, init.speed));
  if (init.flying) effects.push(extra(FLIGHT_AURA, 149));
  return { ...base, effects } satisfies SpellDefinition;
}

const HORSE = mount(458, "Brown Horse", { speed: 59 });
const WOLF_MOUNT = mount(459, "Timber Wolf", { speed: 59 });
const FAST_RAM = mount(460, "Swift Ram", { speed: 99 });
const GRYPHON = mount(461, "Gryphon", { flying: true, speed: 149 });

async function world(over: SpellWorldInit = {}): Promise<SpellWorld> {
  const book = over.book ?? [HORSE, FROST_ARMOR_SPELL];
  return spellWorld({ ...over, book });
}

function selfstate(t: SpellWorld, mounted: boolean) {
  jest.spyOn(t.handle.selfstate, "state").mockReturnValue({ ...IDLE, mounted });
}

function answerCast(t: SpellWorld, then: "mounted" | "none" = "mounted") {
  return jest.spyOn(t.handle, "cast").mockImplementation((spellId) => {
    t.handle.triggerCombatEvent(
      combatEvent(t.state(), "cast_succeeded", spellId),
    );
    if (then === "mounted")
      t.handle.triggerAreaEvent("selfstate", {
        displayId: 14_337,
        taxi: false,
        type: "mounted",
      });
  });
}

function failCast(t: SpellWorld, reason: string) {
  return jest.spyOn(t.handle, "cast").mockImplementation((spellId) => {
    t.handle.triggerCombatEvent(
      combatEvent(t.state(), "cast_failed", spellId, reason),
    );
  });
}

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

describe("spell do:mount", () => {
  test("with no spell it casts the known ground mount on the character and is DONE on the mounted event", async () => {
    const t = await world({ book: [HORSE, GRYPHON] });
    selfstate(t, false);
    const cast = answerCast(t);
    const out = await spellSpec.run({ do: "mount" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(HORSE.id, SELF_GUID);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({
      do: "mount",
      spell: { id: HORSE.id, name: "Brown Horse" },
    });
  });

  test("a faster ground mount beats a slower one, and the last learned wins a tie", async () => {
    const speedy = await world({
      book: [HORSE, FAST_RAM],
      learned: [FAST_RAM.id, HORSE.id],
    });
    selfstate(speedy, false);
    const fast = answerCast(speedy);
    await spellSpec.run({ do: "mount" }, toolCtx(speedy));
    expect(fast).toHaveBeenCalledWith(FAST_RAM.id, SELF_GUID);

    const tied = await world({
      book: [HORSE, WOLF_MOUNT],
      learned: [HORSE.id, WOLF_MOUNT.id],
    });
    selfstate(tied, false);
    const last = answerCast(tied);
    await spellSpec.run({ do: "mount" }, toolCtx(tied));
    expect(last).toHaveBeenCalledWith(WOLF_MOUNT.id, SELF_GUID);
  });

  test("with only a flying mount known and no name it is REFUSED no_mount and sends nothing", async () => {
    const t = await world({ book: [GRYPHON] });
    selfstate(t, false);
    const cast = answerCast(t);
    const refused = await refusal(spellSpec.run({ do: "mount" }, toolCtx(t)));
    expect(refused.reason).toBe("no_mount");
    expect(cast).not.toHaveBeenCalled();
  });

  test("a named flying mount is cast", async () => {
    const t = await world({ book: [HORSE, GRYPHON] });
    selfstate(t, false);
    const cast = answerCast(t);
    const out = await spellSpec.run(
      { do: "mount", spell: "Gryphon" },
      toolCtx(t),
    );
    expect(cast).toHaveBeenCalledWith(GRYPHON.id, SELF_GUID);
    expect(out.status).toBe("DONE");
  });

  test("a known spell that is not a mount is REFUSED not_a_mount and sends nothing", async () => {
    const t = await world();
    selfstate(t, false);
    const cast = answerCast(t);
    const refused = await refusal(
      spellSpec.run({ do: "mount", spell: "Frost Armor" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("not_a_mount");
    expect(cast).not.toHaveBeenCalled();
  });

  test("a spell you do not know is REFUSED unknown_spell", async () => {
    const t = await world({ book: [HORSE], definitions: [GRYPHON] });
    selfstate(t, false);
    const cast = answerCast(t);
    const refused = await refusal(
      spellSpec.run({ do: "mount", spell: "Gryphon" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("unknown_spell");
    expect(cast).not.toHaveBeenCalled();
  });

  test("an already mounted character is REFUSED already_mounted before anything is sent", async () => {
    const t = await world();
    selfstate(t, true);
    const cast = answerCast(t);
    const refused = await refusal(spellSpec.run({ do: "mount" }, toolCtx(t)));
    expect(refused.reason).toBe("already_mounted");
    expect(refused.next).toContain("dismount");
    expect(cast).not.toHaveBeenCalled();
  });

  test("server cast failures map to in_combat, indoors and in_water refusals", async () => {
    const expected: Record<string, string> = {
      affecting_combat: "in_combat",
      no_mounts_allowed: "indoors",
      only_abovewater: "in_water",
      only_outdoors: "indoors",
    };
    for (const [failure, reason] of Object.entries(expected)) {
      const t = await world();
      selfstate(t, false);
      failCast(t, failure);
      const refused = await refusal(spellSpec.run({ do: "mount" }, toolCtx(t)));
      expect(refused.reason).toBe(reason);
    }
  });

  test("another cast failure stays FAILED with the core reason", async () => {
    const t = await world();
    selfstate(t, false);
    failCast(t, "not_enough_mana");
    const out = await spellSpec.run({ do: "mount" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("not_enough_mana");
  });

  test("a mounted event that lands after the cast reply still settles DONE", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      selfstate(t, false);
      answerCast(t, "none");
      const run = spellSpec.run({ do: "mount" }, toolCtx(t));
      await elapse(100);
      t.handle.triggerAreaEvent("selfstate", {
        displayId: 14_337,
        taxi: false,
        type: "mounted",
      });
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("DONE");
    });
  });

  test("a state that already reads mounted when the reply lands is DONE", async () => {
    const t = await world();
    selfstate(t, false);
    jest.spyOn(t.handle, "cast").mockImplementation((spellId) => {
      selfstate(t, true);
      t.handle.triggerCombatEvent(
        combatEvent(t.state(), "cast_succeeded", spellId),
      );
    });
    const out = await spellSpec.run({ do: "mount" }, toolCtx(t));
    expect(out.status).toBe("DONE");
  });

  test("a cast that succeeds but never mounts is UNCONFIRMED no_reply", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      selfstate(t, false);
      answerCast(t, "none");
      const out = await fakeAwait(
        spellSpec.run({ do: "mount" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.reason).toBe("no_reply");
    });
  });

  test("an abort while waiting for the mounted event rejects", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      selfstate(t, false);
      answerCast(t, "none");
      const stop = new AbortController();
      const run = spellSpec.run({ do: "mount" }, toolCtx(t, stop.signal));
      await elapse(100);
      stop.abort(new Error("human_stop"));
      expect(await fakeRejection(run, 2000)).toBe("human_stop");
    });
  });
});

describe("spell do:dismount", () => {
  function act(
    t: SpellWorld,
    outcome: Awaited<ReturnType<AreaActsOf<"selfstate">["dismount"]>>,
  ): void {
    jest.spyOn(t.handle.selfstate.act, "dismount").mockResolvedValue(outcome);
  }
  test("calls the dismount act and is DONE when it answers ok", async () => {
    const t = await world();
    const dismount = jest.spyOn(t.handle.selfstate.act, "dismount");
    dismount.mockResolvedValue({ status: "ok" });
    const out = await spellSpec.run({ do: "dismount" }, toolCtx(t));
    expect(dismount).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({ do: "dismount" });
  });

  test("refusals from the act keep their reason", async () => {
    for (const reason of ["not_mounted", "in_flight"] as const) {
      const t = await world();
      act(t, { reason, status: "refused" });
      const refused = await refusal(
        spellSpec.run({ do: "dismount" }, toolCtx(t)),
      );
      expect(refused.reason).toBe(reason);
    }
  });

  test("no answer is UNCONFIRMED no_reply", async () => {
    const t = await world();
    act(t, { status: "no_answer" });
    const out = await spellSpec.run({ do: "dismount" }, toolCtx(t));
    expect(out.status).toBe("UNCONFIRMED");
    expect(out.reason).toBe("no_reply");
  });

  test("an abort while the act waits rejects", async () => {
    const t = await world();
    const { promise, resolve } = Promise.withResolvers<never>();
    jest.spyOn(t.handle.selfstate.act, "dismount").mockReturnValue(promise);
    const stop = new AbortController();
    const run = spellSpec.run({ do: "dismount" }, toolCtx(t, stop.signal));
    stop.abort(new Error("human_stop"));
    const error = await run.then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("human_stop");
    resolve(undefined as never);
  });

  test("an already aborted signal rejects without calling the act", async () => {
    const t = await world();
    const dismount = jest.spyOn(t.handle.selfstate.act, "dismount");
    dismount.mockResolvedValue({ status: "ok" });
    const stop = new AbortController();
    stop.abort(new Error("human_stop"));
    const error = await spellSpec
      .run({ do: "dismount" }, toolCtx(t, stop.signal))
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect((error as Error).message).toBe("human_stop");
    expect(dismount).not.toHaveBeenCalled();
  });
});
