import { describe, expect, test } from "bun:test";
import type { RecoveryEvent, RecoveryState } from "@peon/core";
import { recoveryDrafts } from "#harness/events/rules-life";
import { createMockGame } from "#test-support/mock-game";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const recoveryBase = createMockGame().getRecoveryState();

function recovery(
  type: RecoveryEvent["type"],
  state: Partial<RecoveryState> = {},
): RecoveryEvent {
  return { at: 0, state: { ...recoveryBase, ...state }, type };
}

function life(state: RecoveryState["life"]): RecoveryEvent {
  return recovery("life_observed", { life: state });
}

function at(x: number, y: number): RecoveryState["reclaim"] {
  const pose = {
    mapId: 530,
    orientation: 0,
    source: "server" as const,
    updatedAt: 0,
    x,
    y,
    z: 70,
  };
  return { ...recoveryBase.reclaim, pose };
}

describe("recoveryDrafts", () => {
  test("wakes on each change of life only", () => {
    const rc = testRuleInput({
      lookup: testLookup({
        lastAttacker: () => 0x2an,
        unitName: () => "Springpaw Stalker",
      }),
    });
    expect(recoveryDrafts(life("alive"), rc)).toEqual([]);
    expect(recoveryDrafts(life("dead"), rc)[0]).toMatchObject({
      class: "wake",
      data: { killer: "2a", killerName: "Springpaw Stalker" },
      event: "life/dead",
      ref: "u42",
      text: "You died (last hit by Springpaw Stalker u42).",
    });
    expect(recoveryDrafts(life("dead"), rc)).toEqual([]);
    expect(recoveryDrafts(life("ghost"), rc)[0]).toMatchObject({
      class: "wake",
      event: "life/released",
    });
    expect(recoveryDrafts(life("alive"), rc)[0]).toMatchObject({
      class: "wake",
      data: { from: "ghost" },
      event: "life/alive",
      text: "You are alive again.",
    });
  });

  test("a resurrection offer is passive", () => {
    const resurrection = {
      delayMs: undefined,
      guid: 7n,
      name: "Bob",
      readyAt: undefined,
      receivedAt: 0,
      reserved: 0,
      response: "unanswered" as const,
      sickness: 0,
    };
    const event: RecoveryEvent = {
      at: 0,
      state: { ...recoveryBase, resurrection },
      type: "resurrection_offered",
    };
    expect(recoveryDrafts(event, testRuleInput())).toEqual([
      {
        class: "passive",
        data: { from: "Bob" },
        domain: "life",
        event: "life/resurrect_offer",
        text: "Bob offers to resurrect you.",
      },
    ]);
  });
});

describe("life/alive", () => {
  test("names the pose, the way back and the distance to the corpse", () => {
    const rc = testRuleInput();
    recoveryDrafts(life("alive"), rc);
    recoveryDrafts(
      recovery("life_observed", { life: "dead", reclaim: at(8790, -6707) }),
      rc,
    );
    recoveryDrafts(life("ghost"), rc);
    const corpse = {
      corpseMapId: 530,
      mapId: 530,
      observedAt: 0,
      position: { x: 8790, y: -6707, z: 61 },
      status: "found" as const,
      unknown: 0,
    };
    recoveryDrafts(recovery("corpse_observed", { corpse, life: "ghost" }), rc);
    recoveryDrafts(recovery("reclaim_requested", { life: "ghost" }), rc);
    const alive = recovery("life_observed", {
      life: "alive",
      reclaim: at(8763.4, -6695.5),
    });
    expect(recoveryDrafts(alive, rc)[0]).toMatchObject({
      class: "wake",
      data: {
        corpseDistance: 30.3,
        from: "ghost",
        pose: { mapId: 530, x: 8763.4, y: -6695.5, z: 70 },
        via: "corpse",
      },
      event: "life/alive",
      text: "You are alive again (corpse reclaim, 30 yd from your corpse).",
    });
  });

  test("a spirit healer or a resurrection is the way back", () => {
    for (const [type, via] of [
      ["spirit_healer_requested", "spirit_healer"],
      ["resurrection_response_requested", "resurrection"],
    ] as const) {
      const rc = testRuleInput();
      recoveryDrafts(life("alive"), rc);
      recoveryDrafts(life("dead"), rc);
      recoveryDrafts(recovery(type, { life: "dead" }), rc);
      expect(recoveryDrafts(life("alive"), rc)[0]?.data).toMatchObject({ via });
    }
  });
});
