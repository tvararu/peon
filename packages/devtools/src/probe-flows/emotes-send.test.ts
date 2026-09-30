import { describe, expect, spyOn, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/emotes-send";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const ME = 0x2an;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;
const OBJECT = 0xf1_10_00_00_01_00_00_09n;
const WAVE = 101;

function row(guid: bigint, objectType: 3 | 4 | 5, self = false): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity = {
    guid,
    name: "Guard",
    objectType,
    position,
    rawFields: new Map(),
  } as unknown as UnitEntity;
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance: self ? 0 : 3,
    entity,
    horizontalDistance: 3,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: [],
    self,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(
  args: Record<string, string>,
  rows: Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () => rows;
  return { args, handle, settle: settleWithin(50) };
}

const world = [row(ME, 4, true), row(OBJECT, 5), row(GUARD, 3)];

describe("emotes-send flow", () => {
  test("waves, then text-emotes the nearest creature and reports the echo", async () => {
    const ctx = context({ linger: "1" }, world);
    const emote = spyOn(ctx.handle.emotes.act, "emote").mockImplementation(
      () => ({ ok: true }),
    );
    const text = spyOn(ctx.handle.emotes.act, "textEmote").mockImplementation(
      async () => {
        ctx.handle.triggerAreaEvent("emotes", {
          emote: 3,
          guid: ME,
          type: "emote",
        });
        ctx.handle.triggerAreaEvent("emotes", {
          emoteNum: 0xff_ff_ff_ff,
          guid: ME,
          self: true,
          target: "Guard",
          textEmote: WAVE,
          type: "text_emote",
        });
        return { ok: true };
      },
    );
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(emote).toHaveBeenCalledWith(3);
    expect(text).toHaveBeenCalledWith("wave", GUARD);
    expect(result["echoes"]).toEqual([
      { emoteNum: 0xff_ff_ff_ff, target: "Guard", textEmote: WAVE },
    ]);
    expect(result["animations"]).toHaveLength(1);
  });

  test("fails when the server never names the target", async () => {
    const ctx = context({ linger: "0" }, world);
    spyOn(ctx.handle.emotes.act, "emote").mockImplementation(() => ({
      ok: true,
    }));
    spyOn(ctx.handle.emotes.act, "textEmote").mockImplementation(async () => ({
      ok: true,
    }));
    await expect(flow.run(ctx)).rejects.toThrow("naming the target");
  });

  test("reports a refused act and sends no text emote", async () => {
    const ctx = context({ linger: "0" }, world);
    spyOn(ctx.handle.emotes.act, "emote").mockImplementation(() => ({
      ok: false,
      reason: "dead",
    }));
    const text = spyOn(ctx.handle.emotes.act, "textEmote");
    await expect(flow.run(ctx)).rejects.toThrow("dead");
    expect(text).not.toHaveBeenCalled();
  });

  test("fails without a creature in view", async () => {
    const ctx = context({}, [row(ME, 4, true), row(OBJECT, 5)]);
    await expect(flow.run(ctx)).rejects.toThrow("no creature");
  });
});
