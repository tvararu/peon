import { describe, expect, jest, test } from "bun:test";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  barState,
  refusal,
  unit,
  world,
} from "#test-support/pets-command-fixture";

describe("pet rename and abandon", () => {
  test("rename is DONE on the name event carrying the requested name", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game.pets.act, "renamePet").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", {
        name: { name: "Fangtooth", number: 7, timestamp: 1 },
        type: "name",
      } as never);
      return { ok: true };
    });
    const out = await petSpec.run(
      { do: "rename", what: "Fangtooth" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Fangtooth");
  });

  test("rename is REFUSED with the reason on name_invalid", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game.pets.act, "renamePet").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", {
        declined: undefined,
        name: "Fangtooth",
        reason: "invalid",
        type: "name_invalid",
      } as never);
      return { ok: true };
    });
    const out = await petSpec.run(
      { do: "rename", what: "Fangtooth" },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.detail).toContain("invalid");
  });

  test("a rename aborted after queueing behind the mutex sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest
      .spyOn(t.game.pets.act, "renamePet")
      .mockImplementation(() => ({ ok: true }));
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "rename", what: "Fangtooth" },
      toolCtx(t, controller.signal),
    );
    await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await expect(run).rejects.toThrow("run stopped");
    expect(sent).not.toHaveBeenCalled();
  });

  test("rename with no answer is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      jest.spyOn(t.game.pets.act, "renamePet").mockImplementation(() => ({
        ok: true,
      }));
      const out = await fakeAwait(
        petSpec.run({ do: "rename", what: "Fangtooth" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("abandon needs the pet's current name or it is REFUSED confirm_name", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang") });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const out = await refusal(
      petSpec.run({ do: "abandon", what: "Wrong" }, toolCtx(t)),
    );
    expect(out.reason).toBe("confirm_name");
    expect(out.detail).toContain("Fang");
    expect(sent).not.toHaveBeenCalled();
  });

  test("abandon with the name is DONE on the cleared bar", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang") });
    jest.spyOn(t.game.pets.act, "abandonPet").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
      return { ok: true };
    });
    const out = await petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t));
    expect(out.status).toBe("DONE");
  });

  test("abandon names the pet by its own saved name, not the creature's", async () => {
    const t = await world({ petEntity: unit(), pets: named("Ravager") });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const out = await refusal(
      petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t)),
    );
    expect(out.reason).toBe("confirm_name");
    expect(out.detail).toContain("Ravager");
    expect(sent).not.toHaveBeenCalled();
  });

  test("abandon is REFUSED name_pending while the pet name query has no answer", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const out = await refusal(
      petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t)),
    );
    expect(out.reason).toBe("name_pending");
    expect(sent).not.toHaveBeenCalled();
  });

  test("abandon is REFUSED name_pending when the cached name predates the last rename", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang", 2) });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const out = await refusal(
      petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t)),
    );
    expect(sent).not.toHaveBeenCalled();
    expect(out.reason).toBe("name_pending");
  });

  test("abandon is REFUSED name_pending while a same-second rename refreshes", async () => {
    const base = named("Rex");
    const t = await world({
      petEntity: unit(),
      pets: { ...base, renamePending: [7] },
    });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const out = await refusal(
      petSpec.run({ do: "abandon", what: "Rex" }, toolCtx(t)),
    );
    expect(sent).not.toHaveBeenCalled();
    expect(out.reason).toBe("name_pending");
  });

  test("abandon aborted after queueing behind the mutex sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang") });
    const sent = jest.spyOn(t.game.pets.act, "abandonPet");
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "abandon", what: "Fang" },
      toolCtx(t, controller.signal),
    );
    await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await expect(run).rejects.toThrow("run stopped");
    expect(sent).not.toHaveBeenCalled();
  });

  test("abandon queued behind the mutex refuses when the pet is renamed first", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang") });
    const sent = jest
      .spyOn(t.game.pets.act, "abandonPet")
      .mockImplementation(() => ({ ok: true }));
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const run = petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t));
    await Promise.resolve();
    const before = t.game.pets.state();
    Object.assign(t.game.pets, {
      state: () => ({
        ...before,
        names: { 7: { name: "Rex", number: 7, timestamp: 2 } },
        pet:
          before.pet === undefined
            ? before.pet
            : { ...before.pet, nameTimestamp: 1, number: 7 },
      }),
    });
    gate.resolve();
    await held;
    const out = await withFakeTimers(async () =>
      fakeAwait(refusal(run), 10_000),
    );
    expect(sent).not.toHaveBeenCalled();
    expect(out.reason).toBe("confirm_name");
  });

  test("abandon queued behind the mutex sends when the pet is unchanged", async () => {
    const t = await world({ petEntity: unit(), pets: named("Fang") });
    const sent = jest
      .spyOn(t.game.pets.act, "abandonPet")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
        return { ok: true };
      });
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const run = petSpec.run({ do: "abandon", what: "Fang" }, toolCtx(t));
    await Promise.resolve();
    gate.resolve();
    await held;
    const out = await run;
    expect(sent).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("DONE");
  });
});

function named(name: string, renamedAt = 1) {
  const base = barState();
  return {
    ...base,
    names: { 7: { name, number: 7, timestamp: 1 } },
    pet: base.pet && { ...base.pet, nameTimestamp: renamedAt, number: 7 },
  };
}
