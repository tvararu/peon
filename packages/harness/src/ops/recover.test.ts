import { describe, expect, test } from "bun:test";
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
      "no resurrection offer",
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
      "no resurrection offer",
      "walk back to your corpse",
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
    expect(result.alternatives[1]).toBe("walk back to your corpse");
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
