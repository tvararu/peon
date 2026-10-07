import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  guardNotificationBody,
  guardReadyBody,
  guardWardenBody,
} from "#test-support/areas/guard";
import type { GuardEvent } from "#wow/areas/guard/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function watch(rig: ReturnType<typeof areaRig<"guard">>): GuardEvent[] {
  const seen: GuardEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return seen;
}

describe("guard area wiring", () => {
  test("SMSG_WARDEN_DATA marks warden active, emits once and sends nothing", () => {
    const rig = areaRig("guard");
    const seen = watch(rig);
    try {
      rig.inject(GameOpcode.SMSG_WARDEN_DATA, guardWardenBody(40));
      rig.inject(GameOpcode.SMSG_WARDEN_DATA, guardWardenBody(12));
      expect(seen).toEqual([{ type: "warden_request", size: 40 }]);
      expect(rig.handle.state().warden.requests).toBe(2);
      expect(rig.handle.state().warden.active).toBe(true);
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("TC9_SMSG_READY_FOR_REDIRECT emits redirect_ready", () => {
    const rig = areaRig("guard");
    const seen = watch(rig);
    try {
      rig.inject(GameOpcode.TC9_SMSG_READY_FOR_REDIRECT, guardReadyBody(0));
      expect(seen).toEqual([{ type: "redirect_ready", ok: true }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_NOTIFICATION emits notification", () => {
    const rig = areaRig("guard");
    const seen = watch(rig);
    try {
      rig.inject(
        GameOpcode.SMSG_NOTIFICATION,
        guardNotificationBody("You do not have permission"),
      );
      expect(seen).toEqual([
        { type: "notification", text: "You do not have permission" },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
