import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { inspectInspectTalentBody } from "#test-support/areas/inspect";
import { type InspectEvent, InspectStore } from "#wow/areas/inspect/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function rigWithEvents() {
  const rig = areaRig("inspect");
  const seen: InspectEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("InspectStore", () => {
  test("SMSG_INSPECT_TALENT emits talents with the parsed reply", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const body = inspectInspectTalentBody({
        gear: [{ entry: 7, slot: 15 }],
        guid: 0x49_13n,
        short: true,
      });
      rig.inject(GameOpcode.SMSG_INSPECT_TALENT, body);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        reply: { gear: [{ entry: 7, slot: 15 }], guid: 0x49_13n },
        type: "talents",
      });
      expect(rig.handle.state()).toEqual({});
    } finally {
      rig.dispose();
    }
  });

  test("dispose clears pending listeners", () => {
    const store = new InspectStore();
    const seen: InspectEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.dispose();
    store.receiveTalents({
      freePoints: 0,
      gear: [],
      guid: 1n,
      short: true,
      specs: [],
    });
    expect(seen).toHaveLength(0);
  });
});
