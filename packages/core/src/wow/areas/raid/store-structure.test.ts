import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

function commandResult(operation: number, member: string, result: number) {
  const w = new PacketWriter();
  w.uint32LE(operation);
  w.cString(member);
  w.uint32LE(result);
  w.uint32LE(0);
  return w.finish();
}

function collect() {
  const rig = areaRig("raid");
  const events: RaidEvent[] = [];
  rig.handle.onEvent((event) => {
    events.push(event);
  });
  return { events, rig };
}

describe("raid command results", () => {
  test("a swap refusal names the operation and the result", () => {
    const { events, rig } = collect();
    try {
      rig.inject(
        GameOpcode.SMSG_PARTY_COMMAND_RESULT,
        commandResult(4, "Nobody", 14),
      );
      expect(events).toEqual([
        {
          member: "Nobody",
          operation: "swap",
          result: "group_swap_failed",
          type: "command_result",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the convert acknowledgement has an empty member and result ok", () => {
    const { events, rig } = collect();
    try {
      rig.inject(GameOpcode.SMSG_PARTY_COMMAND_RESULT, commandResult(0, "", 0));
      expect(events).toEqual([
        {
          member: "",
          operation: "invite",
          result: "ok",
          type: "command_result",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an unknown code keeps its number", () => {
    const { events, rig } = collect();
    try {
      rig.inject(
        GameOpcode.SMSG_PARTY_COMMAND_RESULT,
        commandResult(3, "Tom", 10),
      );
      expect(events[0]).toMatchObject({
        operation: "operation_3",
        result: "result_10",
      });
    } finally {
      rig.dispose();
    }
  });
});
