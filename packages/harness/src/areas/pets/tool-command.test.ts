import { describe, expect, jest, test } from "bun:test";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  barState,
  PET,
  petBarEvent,
  refusal,
  unit,
  WOLF,
  world,
} from "#test-support/pets-command-fixture";

describe("pet follow and stay", () => {
  test("follow sends one petCommand and is DONE on the follow bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const act = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET));
        return { ok: true };
      });
    const out = await petSpec.run({ do: "follow" }, toolCtx(t));
    expect(act).toHaveBeenCalledWith("follow");
    expect(out.status).toBe("DONE");
  });

  test("a follow bar while waiting for stay keeps waiting, then times out UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      const commanded = jest
        .spyOn(t.game.pets.act, "petCommand")
        .mockImplementation(() => {
          t.game.triggerAreaEvent("pets", petBarEvent(PET));
          return { ok: true };
        });
      const run = petSpec.run({ do: "stay" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(commanded).toHaveBeenCalledWith("stay");
      expect(out.status).toBe("UNCONFIRMED");
    });
  });
});

describe("pet stance and stop", () => {
  test("stance passive sends one petStance and is DONE on the passive bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const act = jest
      .spyOn(t.game.pets.act, "petStance")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET, { react: "passive" }));
        return { ok: true };
      });
    const out = await petSpec.run(
      { do: "stance", what: "passive" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith("passive");
    expect(out.status).toBe("DONE");
  });

  test("a missing stance is REFUSED missing_stance and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const stance = jest.spyOn(t.game.pets.act, "petStance");
    const refused = await refusal(petSpec.run({ do: "stance" }, toolCtx(t)));
    expect(refused.reason).toBe("missing_stance");
    expect(stance).not.toHaveBeenCalled();
  });

  test("stop sends petStopAttack then follow and is DONE on the follow bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const stopped = jest
      .spyOn(t.game.pets.act, "petStopAttack")
      .mockImplementation(() => ({ ok: true }));
    const followed = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET));
        return { ok: true };
      });
    const out = await petSpec.run({ do: "stop" }, toolCtx(t));
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(followed).toHaveBeenCalledWith("follow");
    expect(out.status).toBe("DONE");
  });

  test("no pet out is REFUSED no_pet", async () => {
    const t = await world();
    const refused = await refusal(petSpec.run({ do: "follow" }, toolCtx(t)));
    expect(refused.reason).toBe("no_pet");
  });
});

describe("pet attack", () => {
  test("attack sends petAttack at the seen unit and is DONE when the pet targets it", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game, "petAttack").mockImplementation(() => {
      const pet = { ...unit(), target: WOLF };
      Object.assign(t.game.getEntity(PET) ?? {}, { target: WOLF });
      t.game.triggerEntityEvent({
        changed: ["target"],
        entity: pet,
        type: "update",
      } as never);
    });
    const out = await petSpec.run({ do: "attack", target: "u1" }, toolCtx(t));
    expect(sent).toHaveBeenCalledWith(PET, WOLF);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Wolf");
  });

  test("an unseen target is REFUSED not_seen and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game, "petAttack");
    const refused = await refusal(
      petSpec.run({ do: "attack", target: "u9" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("not_seen");
    expect(sent).not.toHaveBeenCalled();
  });

  test("no answer within 5 s is UNCONFIRMED with a walk-back next", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      const run = petSpec.run({ do: "attack", target: "u1" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.next).toContain("travel");
    });
  });
});
