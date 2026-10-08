import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";

import {
  runWintergrasp,
  wintergraspParams,
  wintergraspSpec,
} from "#harness/areas/wintergrasp/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function callOf() {
  return {
    arguments: wintergraspSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

async function rig(
  over: {
    acts?: Record<string, unknown>;
    state?: Record<string, unknown>;
  } = {},
) {
  const t = await createTestRuntime({});
  Object.assign(t.handle.wintergrasp.act, {
    answerEntry: jest.fn(async () => ({
      battleId: 1,
      status: "entered" as const,
    })),
    answerQueue: jest.fn(async () => ({
      battleId: 1,
      status: "queued" as const,
    })),
    exitQueue: jest.fn(async () => ({
      battleId: 1,
      reason: "close",
      status: "left" as const,
    })),
    hearthAndResurrect: jest.fn(async () => ({
      status: "teleported" as const,
    })),
    ...(over.acts ?? {}),
  });
  jest.spyOn(t.handle.wintergrasp, "state").mockReturnValue({
    battleId: 1,
    ejectReason: undefined,
    expiresAt: undefined,
    full: false,
    phase: "queue_offered",
    zone: undefined,
    ...(over.state ?? {}),
  } as never);
  return t;
}

describe("wintergrasp tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: wintergraspParams },
        callOf(),
      ),
    ).toEqual(wintergraspSpec.minimalArgs);
  });
});

describe("wintergrasp accept and decline", () => {
  test("accept answers the pending queue", async () => {
    const t = await rig();
    const out = await runWintergrasp({ action: "accept" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.wintergrasp.act.answerQueue).toHaveBeenCalledWith(true);
    expect(out.detail).toContain("queue");
  });

  test("decline answers the pending war offer", async () => {
    const t = await rig({ state: { phase: "entry_offered" } });
    const out = await runWintergrasp({ action: "decline" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.wintergrasp.act.answerEntry).toHaveBeenCalledWith(false);
  });

  test("accept with no pending offer refuses", async () => {
    const t = await rig({ state: { battleId: undefined, phase: "none" } });
    await expect(
      runWintergrasp({ action: "accept" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_offer" });
  });

  test("a silent offer surfaces no_reply", async () => {
    const t = await rig({
      acts: {
        answerQueue: jest.fn(async () => ({ status: "no_reply" as const })),
      },
    });
    const out = await runWintergrasp({ action: "accept" }, toolCtx(t));
    expect(out).toMatchObject({ reason: "no_reply", status: "REFUSED" });
  });

  test("leave in the queue exits it", async () => {
    const t = await rig({ state: { battleId: 1, phase: "queued" } });
    const out = await runWintergrasp({ action: "leave" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.wintergrasp.act.exitQueue).toHaveBeenCalled();
    const offered = await rig({ state: { phase: "entry_offered" } });
    const entered = await runWintergrasp({ action: "leave" }, toolCtx(offered));
    expect(entered.status).toBe("DONE");
    expect(offered.handle.wintergrasp.act.exitQueue).toHaveBeenCalled();
  });

  test("leave with no queue refuses", async () => {
    const t = await rig({ state: { battleId: undefined, phase: "none" } });
    await expect(
      runWintergrasp({ action: "leave" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_offer" });
    expect(t.handle.wintergrasp.act.exitQueue).not.toHaveBeenCalled();
  });

  test("leave at war hearths out", async () => {
    const t = await rig({ state: { phase: "at_war" } });
    const out = await runWintergrasp({ action: "leave" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(t.handle.wintergrasp.act.hearthAndResurrect).toHaveBeenCalled();
    expect(out.detail).toContain("hearthed");
  });

  test("an unknown action refuses", async () => {
    const t = await rig();
    const refusal = await runWintergrasp({ action: "dance" }, toolCtx(t)).catch(
      (error: unknown) => error,
    );
    expect(refusal).toMatchObject({ reason: "unknown_action" });
  });
});
