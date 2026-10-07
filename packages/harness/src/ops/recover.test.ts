import { describe, expect, jest, test } from "bun:test";
import {
  flushMicrotasks,
  hasSettled,
} from "@peon/core/test-support/microtasks";
import { recoverOp } from "#harness/ops/recover";
import {
  setLife,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const HEALER = 0x40n;
const GUIDE = 0x0d00n;

function guideAt(distance: number) {
  return unitRow({
    distance,
    guid: GUIDE,
    name: "Spirit Guide",
    relation: "friendly",
    roles: ["spirit_guide"],
    x: distance,
    y: 0,
  });
}
function healerAt(distance: number) {
  return unitRow({
    distance,
    guid: HEALER,
    name: "Spirit Healer",
    relation: "friendly",
    roles: ["spirit_healer"],
    x: distance,
    y: 0,
  });
}

describe("recoverOp", () => {
  test("dead: releases once, then runs the core corpse path", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    let releases = 0;
    t.handle.releaseSpirit = () => {
      releases += 1;
      setLife(t.handle, "ghost");
    };
    t.handle.recoverCorpse = async () => ({
      detail: { legs: 4 },
      ok: true,
      outcome: "reclaimed",
    });
    const result = await recoverOp(toolCtx(t), "corpse");
    expect(releases).toBe(1);
    expect(result).toMatchObject({
      legs: 4,
      outcome: { ok: true, outcome: "reclaimed" },
      via: "corpse",
    });
    expect(result.alternatives).toEqual([
      "no spirit healer in view",
      "no spirit guide in view",
      "no resurrection offer",
      "no self-resurrection spell",
    ]);
  });

  test("spirit healer within talk range: activates it and waits for life", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(4)]);
    const activated: bigint[] = [];
    t.handle.activateSpiritHealer = (guid) => {
      activated.push(guid);
      setLife(t.handle, "alive");
    };
    const result = await recoverOp(toolCtx(t), "spirit_healer");
    expect(activated).toEqual([HEALER]);
    expect(result.outcome).toMatchObject({ ok: true, outcome: "resurrected" });
    expect(result.alternatives).toEqual([
      "no spirit guide in view",
      "no resurrection offer",
      "walk back to your corpse",
      "no self-resurrection spell",
    ]);
  });

  test("spirit healer out of range: too_far and no packet", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(20)]);
    let activated = false;
    t.handle.activateSpiritHealer = () => {
      activated = true;
    };
    const result = await recoverOp(toolCtx(t), "spirit_healer");
    expect(result.outcome).toMatchObject({ cause: "too_far", ok: false });
    expect(activated).toBe(false);
  });
  test("self from dead: calls selfResurrect without releasing and reports the spell", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    jest.spyOn(t.handle.selfstate, "state").mockReturnValue({
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
      selfResSpell: 21_169,
      standState: "stand",
      timers: {},
    });
    t.handle.spellDefinition = () => undefined as never;
    let releases = 0;
    t.handle.releaseSpirit = () => {
      releases += 1;
    };
    let resurrects = 0;
    t.handle.selfstate.act.selfResurrect = async () => {
      resurrects += 1;
      setLife(t.handle, "alive");
      return { status: "ok" };
    };
    const result = await recoverOp(toolCtx(t), "self");
    expect(releases).toBe(0);
    expect(resurrects).toBe(1);
    expect(result).toMatchObject({
      outcome: { ok: true, outcome: "resurrected" },
      via: "self",
    });
    expect(result.alternatives).toEqual([
      "no spirit healer in view",
      "no spirit guide in view",
      "no resurrection offer",
      "walk back to your corpse",
    ]);
  });

  test("self with no self-res spell refuses no_self_res and names the other ways", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    jest.spyOn(t.handle.selfstate, "state").mockReturnValue({
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
    });
    let releases = 0;
    t.handle.releaseSpirit = () => {
      releases += 1;
    };
    t.handle.selfstate.act.selfResurrect = async () => ({
      reason: "no_self_res",
      status: "refused",
    });
    const result = await recoverOp(toolCtx(t), "self");
    expect(releases).toBe(0);
    expect(result.outcome).toEqual({ cause: "no_self_res", ok: false });
    expect(result.alternatives).toEqual([
      "no spirit healer in view",
      "no spirit guide in view",
      "no resurrection offer",
      "walk back to your corpse",
    ]);
  });

  test("self when the server stays silent settles no_answer", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    jest.spyOn(t.handle.selfstate, "state").mockReturnValue({
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
      selfResSpell: 21_169,
      standState: "stand",
      timers: {},
    });
    t.handle.selfstate.act.selfResurrect = async () => ({
      status: "no_answer",
    });
    const result = await recoverOp(toolCtx(t), "self");
    expect(result.outcome).toEqual({ cause: "self_res_unanswered", ok: false });
  });
  test("self: an abort during the act rejects with the abort reason", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    t.handle.selfstate.act.selfResurrect = () =>
      new Promise<never>(() => undefined);
    const controller = new AbortController();
    const pending = recoverOp(toolCtx(t, controller.signal), "self");
    controller.abort(new Error("human_stop"));
    await expect(pending).rejects.toThrow("human_stop");
  });

  test("self: an already aborted run never calls the act", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    let resurrects = 0;
    t.handle.selfstate.act.selfResurrect = async () => {
      resurrects += 1;
      return { status: "ok" };
    };
    const controller = new AbortController();
    controller.abort(new Error("human_stop"));
    await expect(
      recoverOp(toolCtx(t, controller.signal), "self"),
    ).rejects.toThrow("human_stop");
    expect(resurrects).toBe(0);
  });

  test("accept: takes the offer and names the other ways", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    setUnits(t.handle, [healerAt(34)]);
    const dead = t.handle.getRecoveryState();
    t.handle.getRecoveryState = () => ({
      ...dead,
      resurrection: {
        delayMs: undefined,
        guid: 0x50n,
        name: "Kaelyn",
        readyAt: undefined,
        receivedAt: 0,
        reserved: 0,
        response: "unanswered",
        sickness: 0,
      },
    });
    let answer: boolean | undefined;
    t.handle.respondResurrection = (accept) => {
      answer = accept;
      setLife(t.handle, "alive");
    };
    const result = await recoverOp(toolCtx(t), "accept");
    expect(answer).toBe(true);
    expect(result.outcome).toMatchObject({ ok: true, outcome: "resurrected" });
    expect(result.alternatives[0]).toStartWith("spirit healer u");
    expect(result.alternatives[1]).toBe("no spirit guide in view");
    expect(result.alternatives[2]).toBe("walk back to your corpse");
    expect(result.alternatives[3]).toBe("no self-resurrection spell");
  });

  test("spirit guide: a resurrection inside the queued countdown succeeds", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [guideAt(4)]);
    Object.assign(t.handle.battlegrounds.act, {
      queueSpiritGuide: jest.fn(async (guid: bigint) => {
        setTimeout(() => setLife(t.handle, "alive"), 50);
        return { guid, ms: 2000 };
      }),
    });
    jest.spyOn(t.handle.battlegrounds, "state").mockReturnValue({
      match: { current: { bgType: 2 }, spirit: undefined },
    } as never);
    jest.useFakeTimers();
    try {
      const pending = recoverOp(toolCtx(t), "spirit_guide");
      for (let step = 0; step < 10; step++) {
        await flushMicrotasks();
        jest.advanceTimersByTime(10);
      }
      await flushMicrotasks();
      const result = await pending;
      expect(t.handle.battlegrounds.act.queueSpiritGuide).toHaveBeenCalledWith(
        GUIDE,
      );
      expect(result.outcome).toMatchObject({
        ok: true,
        outcome: "resurrected",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("spirit guide: silence settles at the queued countdown plus margin", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [guideAt(4)]);
    Object.assign(t.handle.battlegrounds.act, {
      queueSpiritGuide: jest.fn(async (guid: bigint) => ({ guid, ms: 1000 })),
    });
    jest.spyOn(t.handle.battlegrounds, "state").mockReturnValue({
      match: { current: { bgType: 2 }, spirit: undefined },
    } as never);
    jest.useFakeTimers();
    try {
      const pending = recoverOp(toolCtx(t), "spirit_guide");
      for (let step = 0; step < 7; step++) {
        await flushMicrotasks();
        jest.advanceTimersByTime(500);
      }
      await flushMicrotasks();
      jest.advanceTimersByTime(499);
      await flushMicrotasks();
      expect(await hasSettled(pending)).toBe(false);
      jest.advanceTimersByTime(1);
      await flushMicrotasks();
      const result = await pending;
      expect(result.outcome).toEqual({
        cause: "spirit_guide_unanswered",
        ok: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("spirit guide: a rejected queue settles unanswered", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [guideAt(4)]);
    Object.assign(t.handle.battlegrounds.act, {
      queueSpiritGuide: jest.fn(async () => {
        throw new Error("no_reply");
      }),
    });
    jest.spyOn(t.handle.battlegrounds, "state").mockReturnValue({
      match: { current: { bgType: 2 }, spirit: undefined },
    } as never);
    const result = await recoverOp(toolCtx(t), "spirit_guide");
    expect(result.outcome).toEqual({
      cause: "spirit_guide_unanswered",
      ok: false,
    });
  });

  test("accept without an offer refuses in the outcome", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    const result = await recoverOp(toolCtx(t), "accept");
    expect(result.outcome).toEqual({
      cause: "no_resurrection_offer",
      ok: false,
    });
  });
});
