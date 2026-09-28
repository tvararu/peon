import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  ambienceTriggerCinematicBody,
  ambienceTriggerMovieBody,
} from "#test-support/areas/ambience";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("ambience runtime", () => {
  test("sendZoneUpdate sends one CMSG_ZONEUPDATE with the zone id (MiscHandler.cpp:521-532)", () => {
    const rig = areaRig("ambience");
    try {
      rig.handle.act.sendZoneUpdate(3430);
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array([0x66, 0x0d, 0x00, 0x00]),
          opcode: GameOpcode.CMSG_ZONEUPDATE,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("nothing sends CMSG_ZONEUPDATE by itself", () => {
    const rig = areaRig("ambience");
    try {
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an injected 0x0FA completes the cinematic at once with one CMSG_COMPLETE_CINEMATIC (CinematicMgr.cpp:65-75)", () => {
    const rig = areaRig("ambience");
    try {
      rig.inject(
        GameOpcode.SMSG_TRIGGER_CINEMATIC,
        ambienceTriggerCinematicBody(310),
      );
      expect(rig.sent).toEqual([
        { body: new Uint8Array(0), opcode: GameOpcode.CMSG_COMPLETE_CINEMATIC },
      ]);
      expect(rig.handle.state().cinematic).toEqual({
        at: 0,
        completed: true,
        sequenceId: 310,
      });
    } finally {
      rig.dispose();
    }
  });

  test("act.completeCinematic and act.nextCinematicCamera send 0x0FC and 0x0FB (MiscHandler.cpp:940-950)", () => {
    const rig = areaRig("ambience");
    try {
      rig.handle.act.completeCinematic();
      rig.handle.act.nextCinematicCamera();
      expect(rig.sent).toEqual([
        { body: new Uint8Array(0), opcode: GameOpcode.CMSG_COMPLETE_CINEMATIC },
        {
          body: new Uint8Array(0),
          opcode: GameOpcode.CMSG_NEXT_CINEMATIC_CAMERA,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an injected 0x464 records the movie and sends nothing (Player.cpp:5885-5890)", () => {
    const rig = areaRig("ambience");
    try {
      rig.inject(GameOpcode.SMSG_TRIGGER_MOVIE, ambienceTriggerMovieBody(44));
      expect(rig.handle.state().movie).toEqual({ at: 0, movieId: 44 });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
