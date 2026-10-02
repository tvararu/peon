import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { complaintsResultBody } from "#test-support/areas/complaints";
import type { ComplaintsEvent } from "#wow/areas/complaints/store";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("complaints area wiring", () => {
  test("SMSG_COMPLAIN_RESULT emits complaint_received with the code, from one or two bytes", () => {
    const rig = areaRig("complaints");
    const seen: ComplaintsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, complaintsResultBody(0));
      rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, complaintsResultBody(2, 9));
      expect(seen).toEqual([
        { type: "complaint_received", code: 0 },
        { type: "complaint_received", code: 2 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a truncated reply throws and emits nothing", () => {
    const rig = areaRig("complaints");
    const seen: ComplaintsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      expect(() =>
        rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, new Uint8Array()),
      ).toThrow(RangeError);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
