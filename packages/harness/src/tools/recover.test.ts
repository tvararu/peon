import { describe, expect, jest, test } from "bun:test";
import type { RecoverAfter } from "#harness/contract/details";
import { recoverSpec } from "#harness/tools/recover";
import {
  attackBy,
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const HEALER = 0x40n;
const LYNX = 0x21n;

function healerAt(distance: number) {
  return unitRow({
    distance,
    guid: HEALER,
    name: "Spirit Healer",
    relation: "friendly",
    roles: ["spirit_healer"],
    x: 0,
    y: distance,
  });
}

describe("recover", () => {
  test("corpse run: alive again at the corpse", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 0, life: "ghost", maxHp: 217 });
    t.handle.recoverCorpse = async () => {
      setSelf(t.handle, {
        hp: 108,
        life: "alive",
        maxHp: 217,
        x: 8766,
        y: -6560,
      });
      return { detail: { legs: 3 }, ok: true, outcome: "reclaimed" };
    };
    const res = await recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      "DONE alive again near your corpse, at 8766, -6560, after 0 s. HP 108/217.",
    );
  });

  test("corpse run: the reclaim point says how far the corpse is", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 0, life: "ghost", maxHp: 217 });
    t.handle.recoverCorpse = async () => {
      const ghost = t.handle.getRecoveryState();
      t.handle.triggerRecoveryEvent({
        at: 0,
        state: {
          ...ghost,
          reclaim: { ...ghost.reclaim, canRequest: true, distance: 29.3 },
        },
        type: "reclaim_requested",
      });
      setSelf(t.handle, {
        hp: 108,
        life: "alive",
        maxHp: 217,
        x: 8763,
        y: -6695,
      });
      return { detail: { legs: 2 }, ok: true, outcome: "reclaimed" };
    };
    const res = await recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    expect(contentOf(res)).toBe(
      "DONE alive again 29 yd from your corpse, at 8763, -6695, after 0 s. HP 108/217.",
    );
    expect(res.after.corpseYd).toBe(29.3);
  });

  test("unreachable corpse names the other ways and steps to the healer", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(34)]);
    t.handle.recoverCorpse = async () => ({
      cause: "corpse_unreachable",
      detail: { legs: 3 },
      ok: false,
    });
    const res = await recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(res).toMatchObject({
      next: 'recover(how: "spirit_healer")',
      reason: "corpse_unreachable",
      status: "FAILED",
    });
    expect(res.body[0]).toMatch(
      /^Other ways: spirit healer u\d+ 34 yd.* \(resurrection sickness\)\. No resurrection offer\. No self-resurrection spell\.$/,
    );
  });

  test("spirit healer out of range refuses with the corpse path", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(20)]);
    const res = await recoverSpec.run(
      { how: "spirit_healer" },
      toolCtx<RecoverAfter>(t),
    );
    expect(res).toMatchObject({
      next: "recover()",
      reason: "too_far",
      status: "REFUSED",
    });
  });

  test("self from a ghost: report says at the place, with the spell name", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 0, life: "ghost", maxHp: 217 });
    t.handle.spellDefinition = (id) =>
      id === 21_169 ? ({ id, name: "Reincarnation" } as never) : undefined;
    let spell = 21_169;
    const spy = jest
      .spyOn(t.handle.selfstate, "state")
      .mockImplementation(() => ({
        collisionHeight: undefined,
        ghostPending: false,
        lastTransferAbort: undefined,
        selfResSpell: spell,
        standState: "stand",
        timers: {},
      }));
    t.handle.selfstate.act.selfResurrect = async () => {
      spell = 0;
      setSelf(t.handle, {
        hp: 108,
        life: "alive",
        maxHp: 217,
        x: 8766,
        y: -6560,
      });
      return { status: "ok" };
    };
    const res = await recoverSpec.run(
      { how: "self" },
      toolCtx<RecoverAfter>(t),
    );
    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe("DONE");
    expect(res.after.via).toBe("self");
    expect(contentOf(res)).toContain("Reincarnation");
    expect(contentOf(res)).toContain("at 8766, -6560");
  });

  test("self from dead: report says where you died, with the spell name", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 0, life: "dead", maxHp: 217 });
    t.handle.spellDefinition = (id) =>
      id === 21_169 ? ({ id, name: "Reincarnation" } as never) : undefined;
    let spell = 21_169;
    jest.spyOn(t.handle.selfstate, "state").mockImplementation(() => ({
      collisionHeight: undefined,
      ghostPending: false,
      lastTransferAbort: undefined,
      selfResSpell: spell,
      standState: "stand",
      timers: {},
    }));
    t.handle.selfstate.act.selfResurrect = async () => {
      spell = 0;
      setSelf(t.handle, {
        hp: 108,
        life: "alive",
        maxHp: 217,
        x: 8766,
        y: -6560,
      });
      return { status: "ok" };
    };
    const res = await recoverSpec.run(
      { how: "self" },
      toolCtx<RecoverAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Reincarnation");
    expect(contentOf(res)).toContain("where you died");
  });

  test("self without the spell refuses and names the other ways", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    t.handle.selfstate.act.selfResurrect = async () => ({
      reason: "no_self_res",
      status: "refused",
    });
    const res = await recoverSpec.run(
      { how: "self" },
      toolCtx<RecoverAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_self_res", status: "FAILED" });
    expect(res.body[0]).toContain("Other ways:");
  });
  test("self silence reports the no-resurrection-aura note", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    t.handle.selfstate.act.selfResurrect = async () => ({
      status: "no_answer",
    });
    const res = await recoverSpec.run(
      { how: "self" },
      toolCtx<RecoverAfter>(t),
    );
    expect(res).toMatchObject({
      reason: "self_res_unanswered",
      status: "FAILED",
    });
    expect(res.body[1]).toContain("no-resurrection aura");
  });

  test("refuses while alive", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    await expect(
      recoverSpec.run({}, toolCtx<RecoverAfter>(t)),
    ).rejects.toMatchObject({ reason: "alive" });
  });

  test("a new attacker stops the recovery with FAILED interrupted", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    t.handle.recoverCorpse = (signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ cause: "stopped", ok: false }),
          { once: true },
        );
      });
    const pending = recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    await Bun.sleep(0);
    attackBy(t.handle, LYNX);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("human text yields RUNNING and the recovery goes on", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    t.handle.recoverCorpse = (signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ cause: "stopped", ok: false }),
          { once: true },
        );
      });
    const pending = recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.body).toEqual([
      "The human wrote a message. Read it before you act.",
    ]);
    expect(t.rt.runs.active()?.id).toBe(res.runId);
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
