import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { questsNpcTextUpdateBody } from "#test-support/areas/quests";
import { REPLY_TIMEOUT_MS } from "#wow/areas/quests/runtime";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const ERONA = 0xf1_30_00_3f_d1_00_1a_2bn;
const ERONA_TEXT = 8281;

describe("quests npc text queries", () => {
  function dialogRig() {
    jest.useFakeTimers();
    const rig = areaRig("quests");
    const texts = () =>
      rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_NPC_TEXT_QUERY);
    const dialog = (titleTextId = ERONA_TEXT) => {
      rig.stores.quests.requestIntent({ action: "talk", guid: ERONA });
      rig.stores.quests.openDialog({
        kind: "gossip",
        data: { guid: ERONA, menuId: 1, titleTextId, options: [], quests: [] },
      });
      rig.events.quest.emit({
        questId: undefined,
        source: "packet",
        state: rig.stores.quests.state(),
        type: "dialog",
      });
    };
    const tick = (ms: number) => jest.advanceTimersByTime(ms);
    return { dialog, rig, texts, tick };
  }

  test("a gossip dialog with an uncached title text id sends one text query", () => {
    const { dialog, rig, texts } = dialogRig();
    try {
      dialog();
      expect(texts()).toHaveLength(1);
      const first = new PacketReader(texts().at(0)?.body ?? new Uint8Array());
      expect(first.uint32LE()).toBe(ERONA_TEXT);
      expect(first.uint64LE()).toBe(ERONA);
      expect(first.remaining).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("no reply in 5 s gives no_reply", () => {
    const { dialog, rig, texts, tick } = dialogRig();
    try {
      dialog();
      expect(texts()).toHaveLength(1);
      tick(4999);
      expect(rig.handle.state().texts.get(ERONA_TEXT)?.status).toBe("pending");
      tick(1);
      expect(rig.handle.state().texts.get(ERONA_TEXT)?.status).toBe("no_reply");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a reply inside 5 s stays known with the dialog guid after the timeout", () => {
    const { dialog, rig, tick } = dialogRig();
    try {
      dialog();
      rig.inject(
        GameOpcode.SMSG_NPC_TEXT_UPDATE,
        questsNpcTextUpdateBody(ERONA_TEXT),
      );
      tick(REPLY_TIMEOUT_MS);
      expect(rig.handle.state().texts.get(ERONA_TEXT)).toMatchObject({
        guid: ERONA,
        status: "known",
      });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("queryNpcText sends once per uncached id", () => {
    const { rig, texts } = dialogRig();
    try {
      expect(rig.handle.act.queryNpcText(ERONA_TEXT, ERONA)).toBe(true);
      expect(texts()).toHaveLength(1);
      expect(rig.handle.act.queryNpcText(ERONA_TEXT, ERONA)).toBe(false);
      expect(texts()).toHaveLength(1);
      expect(rig.handle.act.queryNpcText(999_999, ERONA)).toBe(true);
      expect(texts()).toHaveLength(2);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
