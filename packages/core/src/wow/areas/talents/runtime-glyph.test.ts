import { describe, expect, test } from "bun:test";
import {
  APPLY,
  castFailed,
  castStarted,
  flush,
  INFO,
  ITEM,
  infoWith,
  MAJOR_SLOT,
  MINOR_SLOT,
  rigged,
  USE,
  USE_SPELL,
} from "#test-support/areas/talents-glyph";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GLYPH_ANSWER_MS } from "#wow/areas/talents/runtime-glyph";

describe("applyGlyph", () => {
  test("a legal call sends the item use with the glyph index and settles on the info that shows the glyph", async () => {
    const { rig, useBody } = rigged();
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      await flush();
      expect(useBody()).toEqual({
        bag: 255,
        castCount: 1,
        glyphIndex: MAJOR_SLOT,
        guid: ITEM,
        slot: 23,
        spellId: USE_SPELL,
      });
      rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
      expect(await pending).toEqual({ glyphId: 21, outcome: "applied" });
    } finally {
      rig.dispose();
    }
  });

  test("a glyph in the equipped bag is sent with the bag's equipment slot as the bag index", async () => {
    const { rig, useBody } = rigged({ placement: "bag" });
    try {
      const pending = rig.handle.act.applyGlyph({
        bag: 19,
        glyphSlot: MAJOR_SLOT,
        slot: 0,
      });
      await flush();
      expect(useBody()).toMatchObject({ bag: 19, guid: ITEM, slot: 0 });
      rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
      expect((await pending).outcome).toBe("applied");
    } finally {
      rig.dispose();
    }
  });

  test("a locked socket is refused locally and nothing is sent", async () => {
    const { rig, sent } = rigged({ enabled: 0b01 });
    try {
      expect(
        await rig.handle.act.applyGlyph({ ...APPLY, glyphSlot: MINOR_SLOT }),
      ).toEqual({ outcome: "slot_locked" });
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("the lock rule runs without the catalog", async () => {
    const { rig, sent } = rigged({ catalog: false, enabled: 0 });
    try {
      expect((await rig.handle.act.applyGlyph(APPLY)).outcome).toBe(
        "slot_locked",
      );
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an item without a use spell is not a glyph", async () => {
    const { rig, sent } = rigged({ useSpell: false });
    try {
      expect(await rig.handle.act.applyGlyph(APPLY)).toEqual({
        outcome: "not_a_glyph",
      });
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a use spell with no apply-glyph effect is not a glyph", async () => {
    const { rig, sent } = rigged({ spellEffect: false });
    try {
      expect((await rig.handle.act.applyGlyph(APPLY)).outcome).toBe(
        "not_a_glyph",
      );
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an apply-glyph effect with no GlyphProperties row is not a glyph", async () => {
    const { rig, sent } = rigged({ glyphProperties: 999 });
    try {
      expect((await rig.handle.act.applyGlyph(APPLY)).outcome).toBe(
        "not_a_glyph",
      );
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a major glyph into the minor socket is wrong_slot_type and sends nothing", async () => {
    const { rig, sent } = rigged();
    try {
      expect(
        await rig.handle.act.applyGlyph({ ...APPLY, glyphSlot: MINOR_SLOT }),
      ).toEqual({ outcome: "wrong_slot_type" });
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("without the catalog the type check is skipped and the server decides", async () => {
    const { rig, useBody } = rigged({ catalog: false });
    try {
      const pending = rig.handle.act.applyGlyph({
        ...APPLY,
        glyphSlot: MINOR_SLOT,
      });
      await flush();
      expect(useBody().glyphIndex).toBe(MINOR_SLOT);
      castFailed(rig, USE_SPELL, "invalid_glyph");
      expect(await pending).toEqual({ outcome: "invalid_glyph" });
    } finally {
      rig.dispose();
    }
  });

  for (const outcome of [
    "invalid_glyph",
    "glyph_socket_locked",
    "unique_glyph",
  ] as const) {
    test(`a ${outcome} cast failure for the item's spell becomes ${outcome}`, async () => {
      const { rig } = rigged();
      try {
        const pending = rig.handle.act.applyGlyph(APPLY);
        await flush();
        castFailed(rig, USE_SPELL, outcome);
        expect(await pending).toEqual({ outcome });
      } finally {
        rig.dispose();
      }
    });
  }

  test("a cast failure for another spell is ignored", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      await flush();
      castFailed(rig, 133, "invalid_glyph");
      rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
      expect((await pending).outcome).toBe("applied");
    } finally {
      rig.dispose();
    }
  });

  test("any other cast failure is reported with its reason", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      await flush();
      castFailed(rig, USE_SPELL, "not_ready");
      expect(await pending).toEqual({ outcome: "failed", reason: "not_ready" });
    } finally {
      rig.dispose();
    }
  });

  test("an info that leaves the socket empty does not settle the apply", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      await flush();
      rig.inject(INFO, infoWith([0, 0, 0, 0, 0, 0]));
      castFailed(rig, USE_SPELL, "invalid_glyph");
      expect((await pending).outcome).toBe("invalid_glyph");
    } finally {
      rig.dispose();
    }
  });

  test("a second talent act while one runs throws talent_request_busy and sends nothing more", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      pending.catch(() => undefined);
      await flush();
      const before = rig.sent.length;
      await expect(rig.handle.act.removeGlyph(0)).rejects.toThrow(
        "talent_request_busy",
      );
      expect(rig.sent.length).toBe(before);
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("an empty slot throws no_item and sends nothing", async () => {
    const { rig, sent } = rigged();
    try {
      await expect(
        rig.handle.act.applyGlyph({ ...APPLY, slot: 30 }),
      ).rejects.toThrow("no_item");
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a glyph slot outside 0-5 throws bad_glyph_slot", async () => {
    const { rig, sent } = rigged();
    try {
      await expect(
        rig.handle.act.applyGlyph({ ...APPLY, glyphSlot: 6 }),
      ).rejects.toThrow("bad_glyph_slot");
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
  test("an observed five-second cast moves the reply deadline to cast time plus five seconds", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged();
      try {
        const pending = rig.handle.act.applyGlyph(APPLY);
        await flush();
        castStarted(rig, USE_SPELL, 5000);
        await flush();
        await elapse(GLYPH_ANSWER_MS + 4999);
        rig.inject(INFO, infoWith([21, 0, 0, 0, 0, 0]));
        await elapse(1);
        expect(await pending).toEqual({ glyphId: 21, outcome: "applied" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("disposing while the item template loads rejects instead of not_a_glyph", async () => {
    const { rig, sent } = rigged({ templateCached: false });
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      pending.catch(() => undefined);
      await flush();
      rig.dispose();
      await expect(pending).rejects.toThrow();
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("disposing while the catalog loads rejects instead of waiting for it", async () => {
    const { rig, sent } = rigged({ catalogPending: true });
    try {
      const pending = rig.handle.act.applyGlyph(APPLY);
      pending.catch(() => undefined);
      await flush();
      rig.dispose();
      await expect(pending).rejects.toThrow();
      expect(sent(USE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("five seconds of silence is no_reply and the waiter is released", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged();
      try {
        const pending = rig.handle.act.applyGlyph(APPLY);
        await elapse(GLYPH_ANSWER_MS + 100);
        expect(await pending).toEqual({ outcome: "no_reply" });
        rig.stores.combat.casts.clear();
        const again = rig.handle.act.applyGlyph(APPLY);
        await elapse(GLYPH_ANSWER_MS + 100);
        expect((await again).outcome).toBe("no_reply");
      } finally {
        rig.dispose();
      }
    });
  });

  test("disposing mid-wait rejects the act", async () => {
    const { rig } = rigged();
    const pending = rig.handle.act.applyGlyph(APPLY);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    await flush();
    rig.dispose();
    expect(await settled).toBe("rejected");
  });

  test("a combat cast already in flight is busy and sends nothing", async () => {
    const { rig } = rigged();
    try {
      rig.stores.combat.casts.beginChannel({
        durationMs: 3000,
        spellId: 133,
        target: 1n,
      });
      const before = rig.sent.length;
      expect(await rig.handle.act.applyGlyph(APPLY)).toEqual({
        outcome: "busy",
      });
      expect(rig.sent.length).toBe(before);
    } finally {
      rig.dispose();
    }
  });
});
