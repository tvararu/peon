import { describe, expect, jest, test } from "bun:test";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  BITE,
  barState,
  GROWL,
  PET,
  petBarEvent,
  refusal,
  unit,
  WOLF,
  world,
} from "#test-support/pets-command-fixture";
import { definition } from "#test-support/spell-tool-fixtures";

type PetsWorld = Awaited<ReturnType<typeof world>>;

describe("pet cast", () => {
  test("cast resolves the name, sends the pet cast and is DONE on the new cooldown", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest
      .spyOn(t.game.pets.act, "petCast")
      .mockImplementation(() => {
        const state = t.game.pets.state();
        Object.assign(t.game.pets, {
          state: () => ({
            ...state,
            bar: state.bar,
            cooldowns: [{ infinite: false, readyAt: 99_999, spell: GROWL }],
          }),
        });
        queueMicrotask(() => t.game.triggerAreaEvent("pets", petBarEvent(PET)));
        return { castCount: 1, confirmed: true, ok: true };
      });
    const out = await petSpec.run(
      { do: "cast", target: "u1", what: "Growl" },
      toolCtx(t),
    );
    expect(sent).toHaveBeenCalledWith(
      GROWL,
      expect.objectContaining({ kind: "unit" }),
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Growl");
  });

  test("cast with no definition loaded is UNCONFIRMED, never plain success", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game.pets.act, "petCast").mockImplementation(() => {
      const state = t.game.pets.state();
      Object.assign(t.game.pets, {
        state: () => ({
          ...state,
          cooldowns: [{ infinite: false, readyAt: 99_999, spell: GROWL }],
        }),
      });
      queueMicrotask(() => t.game.triggerAreaEvent("pets", petBarEvent(PET)));
      return { castCount: 1, confirmed: false, ok: true };
    });
    const out = await petSpec.run(
      { do: "cast", target: "u1", what: "Growl" },
      toolCtx(t),
    );
    expect(out.status).toBe("UNCONFIRMED");
  });

  test("cast is FAILED with the reason from the matching cast_failed", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game.pets.act, "petCast").mockImplementation(() => {
      queueMicrotask(() =>
        t.game.triggerAreaEvent("pets", {
          castCount: 1,
          reason: "not_ready",
          spell: GROWL,
          type: "cast_failed",
        } as never),
      );
      return { castCount: 1, confirmed: true, ok: true };
    });
    const out = await petSpec.run(
      { do: "cast", target: "u1", what: "Growl" },
      toolCtx(t),
    );
    expect(out.status).toBe("FAILED");
    expect(out.detail).toContain("not_ready");
  });

  test("a cast_failed for another request of the same spell does not fail this cast", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      jest.spyOn(t.game.pets.act, "petCast").mockImplementation(() => {
        queueMicrotask(() =>
          t.game.triggerAreaEvent("pets", {
            castCount: 1,
            reason: "not_ready",
            spell: GROWL,
            type: "cast_failed",
          } as never),
        );
        return { castCount: 2, confirmed: true, ok: true };
      });
      const out = await fakeAwait(
        petSpec.run({ do: "cast", target: "u1", what: "Growl" }, toolCtx(t)),
        30_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  const rangeMiss = (t: PetsWorld) =>
    jest.spyOn(t.game.pets.act, "petCast").mockImplementation(() => {
      for (const reason of ["out_of_range", "dont_report", "dont_report"])
        queueMicrotask(() =>
          t.game.triggerAreaEvent("pets", {
            castCount: 1,
            reason,
            spell: GROWL,
            type: "cast_failed",
          } as never),
        );
      return { castCount: 1, confirmed: true, ok: true };
    });

  const growlOnCooldown = (t: PetsWorld) => {
    const state = t.game.pets.state();
    Object.assign(t.game.pets, {
      state: () => ({
        ...state,
        cooldowns: [{ infinite: false, readyAt: 99_999, spell: GROWL }],
      }),
    });
  };

  test("a range miss is not a failure: the pet closes in and the later cooldown settles DONE", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      rangeMiss(t);
      setTimeout(() => growlOnCooldown(t), 9000);
      const out = await fakeAwait(
        petSpec.run({ do: "cast", target: "u1", what: "Growl" }, toolCtx(t)),
        30_000,
      );
      expect(out.status).toBe("DONE");
      expect(out.detail).toContain("closed in");
    });
  });

  test("a range miss with no cast afterwards is UNCONFIRMED closing_in", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      rangeMiss(t);
      const out = await fakeAwait(
        petSpec.run({ do: "cast", target: "u1", what: "Growl" }, toolCtx(t)),
        60_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.reason).toBe("closing_in");
    });
  });

  test("a cooldown that arrives without a bar update still settles DONE", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      jest.spyOn(t.game.pets.act, "petCast").mockImplementation(() => {
        setTimeout(() => growlOnCooldown(t), 600);
        return { castCount: 1, confirmed: true, ok: true };
      });
      const out = await fakeAwait(
        petSpec.run({ do: "cast", target: "u1", what: "Growl" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("DONE");
    });
  });

  test("cast of an unknown spell names the pet's spells", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const out = await refusal(
      petSpec.run({ do: "cast", target: "u1", what: "Fireball" }, toolCtx(t)),
    );
    expect(out.reason).toBe("unknown_pet_spell");
    expect(out.body.join(" ")).toContain("Growl");
  });

  test("a cast aborted after queueing behind the mutex sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest
      .spyOn(t.game.pets.act, "petCast")
      .mockImplementation(() => ({ castCount: 1, confirmed: true, ok: true }));
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "cast", target: "u1", what: "Growl" },
      toolCtx(t, controller.signal),
    );
    await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await expect(run).rejects.toThrow("run stopped");
    expect(sent).not.toHaveBeenCalled();
  });

  test("cast of a passive spell is refused by the act", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest
      .spyOn(t.game.pets.act, "petCast")
      .mockImplementation(() => ({ ok: false, reason: "passive" }));
    const out = await refusal(
      petSpec.run({ do: "cast", target: "u1", what: "Claw" }, toolCtx(t)),
    );
    expect(out.reason).toBe("passive");
    expect(sent).toHaveBeenCalledWith(
      16_827,
      expect.objectContaining({ kind: "unit" }),
    );
  });
  test("cast ignores a vehicle bar whose slots carry no spell ids", async () => {
    const TANK = 0xf1_50_00_62_f6_0c_89_41n;
    const t = await world({
      petEntity: unit(),
      pets: barState({
        bar: undefined,
        cooldowns: [],
        lastRefusal: undefined,
        pet: undefined,
      }),
    });
    Object.assign(t.game.pets, {
      state: () => ({
        bar: {
          command: "unknown",
          family: 0,
          flags: 0x8_00,
          guid: TANK,
          react: "unknown",
          slots: [{ action: 0, type: 9 }],
          spells: [],
        },
        cooldowns: [],
        pet: undefined,
      }),
    });
    const out = await refusal(
      petSpec.run({ do: "cast", target: "", what: "46598" }, toolCtx(t)),
    );
    expect(out.reason).toBe("unknown_pet_spell");
    expect(out.detail).toContain("46598");
  });
  test("cast resolves a vehicle bar slot spell by id without a pet view", async () => {
    const TANK = 0xf1_50_00_62_f6_0c_89_41n;
    const CANNON = 46_598;
    const t = await world({
      petEntity: unit(),
      pets: barState({
        bar: undefined,
        cooldowns: [],
        lastRefusal: undefined,
        pet: undefined,
      }),
    });
    Object.assign(t.game.pets, {
      state: () => ({
        bar: {
          command: "unknown",
          family: 0,
          flags: 0x8_00,
          guid: TANK,
          react: "unknown",
          slots: [
            { action: CANNON, type: 8 },
            { action: 0, type: 9 },
          ],
          spells: [],
        },
        cooldowns: [],
        pet: undefined,
      }),
    });
    const sent = jest
      .spyOn(t.game.pets.act, "petCast")
      .mockImplementation(() => {
        Object.assign(t.game.pets, {
          state: () => ({
            bar: undefined,
            cooldowns: [{ infinite: false, readyAt: 99_999, spell: CANNON }],
            pet: undefined,
          }),
        });
        queueMicrotask(() =>
          t.game.triggerAreaEvent("pets", petBarEvent(TANK)),
        );
        return { castCount: 1, confirmed: true, ok: true };
      });
    const out = await petSpec.run(
      { do: "cast", target: "", what: "46598" },
      toolCtx(t),
    );
    expect(sent).toHaveBeenCalledWith(
      CANNON,
      expect.objectContaining({ kind: "none" }),
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("46598");
  });
});

describe("pet autocast", () => {
  test("autocast off is DONE on the next bar showing type off", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game.pets.act, "petAutocast").mockImplementation(() => {
      t.game.triggerAreaEvent(
        "pets",
        petBarEvent(PET, {
          spells: [
            { autocast: "on", spell: BITE },
            { autocast: "off", spell: GROWL },
          ],
        }),
      );
      return { ok: true };
    });
    const out = await petSpec.run(
      { do: "autocast", what: "Growl off" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("off");
  });

  test("autocast that is already off sends nothing and is DONE", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game.pets.act, "petAutocast");
    const out = await petSpec.run(
      { do: "autocast", what: "Growl off" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("already");
    expect(sent).not.toHaveBeenCalled();
  });

  test("autocast without on or off is REFUSED missing_state", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const out = await refusal(
      petSpec.run({ do: "autocast", what: "Growl" }, toolCtx(t)),
    );
    expect(out.reason).toBe("missing_state");
  });

  test("autocast with no reply is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      jest.spyOn(t.game.pets.act, "petAutocast").mockImplementation(() => ({
        ok: true,
      }));
      const out = await fakeAwait(
        petSpec.run({ do: "autocast", what: "Bite off" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("an autocast aborted after queueing behind the mutex sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest
      .spyOn(t.game.pets.act, "petAutocast")
      .mockImplementation(() => ({ ok: true }));
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "autocast", what: "Bite off" },
      toolCtx(t, controller.signal),
    );
    await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await expect(run).rejects.toThrow("run stopped");
    expect(sent).not.toHaveBeenCalled();
  });
});

describe("pet tame", () => {
  test("tame casts Tame Beast on the target and is DONE on the new bar", async () => {
    const t = await world({
      petEntity: undefined,
      pets: barState({ bar: undefined, cooldowns: [], pet: undefined }),
    });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
    });
    const book = jest.spyOn(t.game, "getSpellbook");
    const base = await book.getMockImplementation()?.();
    book.mockImplementation(async () => [
      ...(base ?? []),
      definition({ id: 1515, name: "Tame Beast" }),
    ]);
    const out = await petSpec.run({ do: "tame", target: "u1" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(1515, WOLF);
    expect(out.status).toBe("DONE");
  });

  test("tame with the pet already out is REFUSED already_out and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const cast = jest.spyOn(t.game, "cast");
    const out = await refusal(
      petSpec.run({ do: "tame", target: "u1" }, toolCtx(t)),
    );
    expect(out.reason).toBe("already_out");
    expect(cast).not.toHaveBeenCalled();
  });

  test("tame is FAILED on the tame_failed event", async () => {
    const t = await world({
      petEntity: undefined,
      pets: barState({ bar: undefined, cooldowns: [], pet: undefined }),
    });
    jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", {
        code: 7,
        reason: "no_pet",
        type: "tame_failed",
      } as never);
    });
    const book = jest.spyOn(t.game, "getSpellbook");
    const base = await book.getMockImplementation()?.();
    book.mockImplementation(async () => [
      ...(base ?? []),
      definition({ id: 1515, name: "Tame Beast" }),
    ]);
    const out = await petSpec.run({ do: "tame", target: "u1" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
  });

  test("a tame aborted after queueing behind the mutex sends nothing", async () => {
    const t = await world({
      petEntity: undefined,
      pets: barState({ bar: undefined, cooldowns: [], pet: undefined }),
    });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {});
    const book = jest.spyOn(t.game, "getSpellbook");
    const base = await book.getMockImplementation()?.();
    book.mockImplementation(async () => [
      ...(base ?? []),
      definition({ id: 1515, name: "Tame Beast" }),
    ]);
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const queued = jest.spyOn(t.rt.mutex, "run");
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "tame", target: "u1" },
      toolCtx(t, controller.signal),
    );
    const outcome = run.then(
      () => undefined,
      (error: unknown) => error,
    );
    while (queued.mock.calls.length === 0) await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await outcome;
    await expect(run).rejects.toThrow("run stopped");
    expect(cast).not.toHaveBeenCalled();
  });
});
