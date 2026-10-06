import { describe, expect, test } from "bun:test";
import {
  flush,
  INFO,
  infoWith,
  REMOVE,
  rigged,
} from "#test-support/areas/talents-glyph";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GLYPH_ANSWER_MS } from "#wow/areas/talents/runtime-glyph";
import { PacketReader } from "#wow/protocol/packet";

describe("removeGlyph", () => {
  test("an empty socket is slot_empty and sends nothing", async () => {
    const { rig, sent } = rigged();
    try {
      rig.inject(INFO, infoWith([0, 0, 0, 0, 0, 0]));
      expect(await rig.handle.act.removeGlyph(2)).toEqual({
        outcome: "slot_empty",
      });
      expect(sent(REMOVE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a socket outside 0-5 is slot_empty and sends nothing", async () => {
    const { rig, sent } = rigged();
    try {
      expect((await rig.handle.act.removeGlyph(6)).outcome).toBe("slot_empty");
      expect((await rig.handle.act.removeGlyph(-1)).outcome).toBe("slot_empty");
      expect(sent(REMOVE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a filled socket sends the index and resolves removed when the next info shows 0", async () => {
    const { rig, sent } = rigged({ glyphIds: [21, 0, 0, 0, 0, 0] });
    try {
      rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
      const pending = rig.handle.act.removeGlyph(0);
      await flush();
      expect(
        new PacketReader(sent(REMOVE)[0]?.body ?? new Uint8Array()).uint32LE(),
      ).toBe(0);
      rig.inject(INFO, infoWith([0, 0, 0, 0, 0, 0]));
      expect(await pending).toEqual({ outcome: "removed" });
    } finally {
      rig.dispose();
    }
  });

  test("an info that still shows the glyph does not settle the removal", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged({ glyphIds: [21, 0, 0, 0, 0, 0] });
      try {
        rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
        const pending = rig.handle.act.removeGlyph(0);
        await elapse(1);
        rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
        await elapse(GLYPH_ANSWER_MS + 1);
        expect(await pending).toEqual({ outcome: "no_reply" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("silence is no_reply after five seconds", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged({ glyphIds: [21, 0, 0, 0, 0, 0] });
      try {
        rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
        const pending = rig.handle.act.removeGlyph(0);
        await elapse(GLYPH_ANSWER_MS + 1);
        expect(await pending).toEqual({ outcome: "no_reply" });
      } finally {
        rig.dispose();
      }
    });
  });
});
