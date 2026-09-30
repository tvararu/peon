import { describe, expect, jest, test } from "bun:test";
import {
  elapse,
  fakeAwait,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  BITE,
  barState,
  CALL_PET,
  DISMISS_PET,
  HAPPY,
  ME,
  PET,
  petBarEvent,
  REVIVE_PET,
  refusal,
  unit,
  world,
} from "#test-support/pets-command-fixture";
import { combatEvent, definition } from "#test-support/spell-tool-fixtures";

describe("pet status", () => {
  test("status sends nothing and reports no pet when the bar is missing", async () => {
    const t = await world();
    const out = await petSpec.run({}, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toBe("You have no pet out.");
    expect(t.game.sent).toHaveLength(0);
  });

  test("status prints name, family, level, health, happiness, stance, command and spells with autocast and cooldowns", async () => {
    const t = await world({
      elapsed: 2,
      petEntity: unit(),
      pets: barState(),
    });
    const out = await petSpec.run({}, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Fang");
    expect(out.detail).toContain("Wolf");
    expect(out.detail).toContain("level 10");
    expect(out.detail).toContain("410/410");
    expect(out.detail).toContain("happy");
    expect(out.detail).toContain("defensive, follow");
    expect(out.body.join("\n")).toContain("Bite (17253): autocast on, ready.");
    expect(out.body.join("\n")).toContain(
      "Growl (2649): autocast off, ready in 3 s.",
    );
    expect(t.game.sent).toHaveLength(0);
  });

  test("status shows an infinite cooldown as unavailable, never ready", async () => {
    const t = await world({
      elapsed: 2,
      petEntity: unit(),
      pets: barState({
        cooldowns: [{ infinite: true, readyAt: undefined, spell: BITE }],
      }),
    });
    const out = await petSpec.run({}, toolCtx(t));
    const line = out.body.find((row) => row.startsWith("Bite")) ?? "";
    expect(line).toContain("unavailable");
    expect(line).not.toContain("ready");
  });
});

describe("pet call, revive and dismiss", () => {
  test("call casts Call Pet and is DONE on the new bar", async () => {
    const t = await world({ petEntity: unit() });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
    });
    const out = await petSpec.run({ do: "call" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(CALL_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("call with the pet already out is REFUSED already_out and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const cast = jest.spyOn(t.game, "cast");
    const refused = await refusal(petSpec.run({ do: "call" }, toolCtx(t)));
    expect(refused.reason).toBe("already_out");
    expect(cast).not.toHaveBeenCalled();
  });

  test("revive casts Revive Pet on a dead pet and is DONE on the bar", async () => {
    const t = await world({
      petEntity: unit({ health: 0 }),
      pets: barState({
        pet: {
          canAbandon: true,
          guid: PET,
          happiness: HAPPY,
          health: 0,
          maxHealth: 410,
        },
      }),
    });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
    });
    const out = await petSpec.run({ do: "revive" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(REVIVE_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("dismiss casts Dismiss Pet on a hunter pet and is DONE on the clear", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
    });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(DISMISS_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("dismiss on a pet that cannot be abandoned uses petCommand dismiss", async () => {
    const t = await world({
      petEntity: unit(),
      pets: barState({
        pet: {
          canAbandon: false,
          guid: PET,
          happiness: HAPPY,
          health: 410,
          maxHealth: 410,
        },
      }),
    });
    const cast = jest.spyOn(t.game, "cast");
    const commanded = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
        return { ok: true };
      });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(commanded).toHaveBeenCalledWith("dismiss");
    expect(cast).not.toHaveBeenCalled();
    expect(out.status).toBe("DONE");
  });

  test("no answer within 5 s is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit() });
      const run = petSpec.run({ do: "call" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("call with only the cast success and no bar is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit() });
      jest.spyOn(t.game, "cast").mockImplementation((spellId) => {
        t.game.triggerCombatEvent(
          combatEvent(t.game.getCombatState(), "cast_succeeded", spellId),
        );
      });
      const out = await fakeAwait(
        petSpec.run({ do: "call" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("call with the cast success still pending waits for the bar", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit() });
      jest.spyOn(t.game, "cast").mockImplementation((spellId) => {
        t.game.triggerCombatEvent(
          combatEvent(t.game.getCombatState(), "cast_succeeded", spellId),
        );
      });
      const run = petSpec.run({ do: "call" }, toolCtx(t));
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await fakeAwait(Promise.resolve(), 100);
      expect(settled).toBe(false);
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
      const out = await fakeAwait(run, 100);
      expect(out.status).toBe("DONE");
    });
  });

  test("call with a failed cast is FAILED", async () => {
    const t = await world({ petEntity: unit() });
    jest.spyOn(t.game, "cast").mockImplementation((spellId) => {
      t.game.triggerCombatEvent(
        combatEvent(t.game.getCombatState(), "cast_failed", spellId),
      );
    });
    const out = await petSpec.run({ do: "call" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
  });

  test("dismiss of a pet that cannot be abandoned needs no Dismiss Pet spell", async () => {
    const t = await world({
      known: [{ id: CALL_PET, name: "Call Pet" }],
      petEntity: unit(),
      pets: barState({
        pet: {
          canAbandon: false,
          guid: PET,
          happiness: HAPPY,
          health: 410,
          maxHealth: 410,
        },
      }),
    });
    const commanded = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
        return { ok: true };
      });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(commanded).toHaveBeenCalledWith("dismiss");
    expect(out.status).toBe("DONE");
  });

  test("dismiss waits out the 5 s cast before the clear bar arrives", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      const base = t.game.spellDefinition;
      jest
        .spyOn(t.game, "spellDefinition")
        .mockImplementation((id: number) =>
          id === DISMISS_PET
            ? definition({ castMs: 5000, id, name: "Dismiss Pet" })
            : base(id),
        );
      jest.spyOn(t.game, "cast").mockImplementation(() => {});
      const run = petSpec.run({ do: "dismiss" }, toolCtx(t));
      await elapse(9985);
      t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
      const out = await fakeAwait(run, 100);
      expect(out.status).toBe("DONE");
    });
  });

  test("a pet refusal during the Dismiss Pet cast does not fail it; the later clear is DONE", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      jest.spyOn(t.game, "cast").mockImplementation(() => {
        t.game.triggerAreaEvent("pets", {
          reason: "nothing_to_attack",
          type: "feedback",
        } as never);
        t.game.triggerAreaEvent("pets", {
          castCount: 1,
          reason: "out_of_range",
          spell: BITE,
          type: "cast_failed",
        } as never);
      });
      const run = petSpec.run({ do: "dismiss" }, toolCtx(t));
      await elapse(50);
      t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
      const out = await fakeAwait(run, 100);
      expect(out.status).toBe("DONE");
    });
  });

  test("dismiss with a failed owner cast is FAILED", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    jest.spyOn(t.game, "cast").mockImplementation((spellId) => {
      t.game.triggerCombatEvent(
        combatEvent(t.game.getCombatState(), "cast_failed", spellId),
      );
    });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
  });

  test("revive of a dead pet that is still out is DONE when its health rises, with no new bar", async () => {
    await withFakeTimers(async () => {
      const dead = { ...unit({ health: 0 }), maxHealth: 410 };
      const t = await world({
        petEntity: dead,
        pets: barState({
          pet: {
            canAbandon: true,
            guid: PET,
            happiness: HAPPY,
            health: 0,
            maxHealth: 410,
          },
        }),
      });
      jest.spyOn(t.game, "cast").mockImplementation((spellId) => {
        t.game.triggerCombatEvent(
          combatEvent(t.game.getCombatState(), "cast_succeeded", spellId),
        );
      });
      const run = petSpec.run({ do: "revive" }, toolCtx(t));
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await fakeAwait(Promise.resolve(), 100);
      expect(settled).toBe(false);
      const risen = { ...dead, health: 205 };
      Object.assign(dead, { health: 205 });
      t.game.triggerEntityEvent({
        changed: ["health"],
        entity: risen,
        type: "update",
      } as never);
      const out = await fakeAwait(run, 100);
      expect(out.status).toBe("DONE");
    });
  });

  test("revive stays UNCONFIRMED when an already alive pet gets another update", async () => {
    await withFakeTimers(async () => {
      const t = await world({
        petEntity: unit({ health: 410 }),
        pets: barState(),
      });
      jest.spyOn(t.game, "cast").mockImplementation(() => {});
      const run = petSpec.run({ do: "revive" }, toolCtx(t));
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await fakeAwait(Promise.resolve(), 100);
      expect(settled).toBe(false);
      t.game.triggerEntityEvent({
        changed: ["health"],
        entity: unit({ health: 410 }),
        type: "update",
      } as never);
      await fakeAwait(Promise.resolve(), 100);
      expect(settled).toBe(false);
      const out = await fakeAwait(run, 20_000);
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("revive of a dead pet that never rises is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({
        petEntity: unit({ health: 0 }),
        pets: barState(),
      });
      jest.spyOn(t.game, "cast").mockImplementation(() => {});
      const out = await fakeAwait(
        petSpec.run({ do: "revive" }, toolCtx(t)),
        20_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });
});
