import { must } from "#test-support/must";
import { hexBytes } from "#test-support/quest-8325-packets";
import { testStores } from "#test-support/session-fixtures";
import { EntityStore } from "#wow/entity-store";
import {
  registerLootHandlers,
  registerQuestHandlers,
  registerTrainerHandlers,
  registerVendorHandlers,
} from "#wow/gameplay-handlers";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketReader } from "#wow/protocol/packet";
import {
  ITEM_FIELDS,
  OBJECT_FIELDS,
  PLAYER_FIELDS,
} from "#wow/protocol/update-fields";
import { OpcodeDispatch } from "#wow/protocol/world";
import { type QuestEvent, QuestRuntime } from "#wow/quests";
import type { WorldConn } from "#wow/world-conn";

export function questCapture(self: bigint) {
  const entities = new EntityStore();
  entities.create(self, ObjectType.PLAYER, { createComplete: true });
  const sent: number[] = [];
  const bodies: string[] = [];
  const events: QuestEvent[] = [];
  let clock = 1000;
  const deps = {
    getEntity: (guid: bigint) => entities.get(guid),
    now: () => clock,
    selfGuid: () => self,
    send: (opcode: number, body?: Uint8Array) => {
      sent.push(opcode);
      bodies.push(Buffer.from(body ?? []).toString("hex"));
    },
  };
  const stores = testStores(deps);
  const store = stores.quests;
  const runtime = new QuestRuntime(store, deps);
  runtime.onEvent((event) => events.push(event));
  store.observeSelfCreate(must(entities.get(self)));
  store.observeQuestLog();
  const dispatch = new OpcodeDispatch();
  const conn = { dispatch } as unknown as WorldConn;
  registerQuestHandlers(conn, stores);
  registerLootHandlers(conn, stores);
  registerTrainerHandlers(conn, stores);
  registerVendorHandlers(conn, stores);
  const packet = (opcode: number, hex: string) =>
    dispatch.handle(opcode, new PacketReader(hexBytes(hex)));
  const logQuest = (questId: number, flags: number, counters = 0) => {
    const base = PLAYER_FIELDS.QUEST_LOG.offset;
    const values = [questId, flags, counters, 0, 0];
    entities.update(
      self,
      {},
      new Map(values.map((value, i) => [base + i, value])),
    );
    store.observeQuestLog();
  };
  const carry = (item: bigint, slot: number, itemId: number, count: number) => {
    if (!entities.get(item))
      entities.create(item, ObjectType.ITEM, { createComplete: true });
    const guidWords = (guid: bigint) => [
      Number(guid & 0xff_ff_ff_ffn),
      Number(guid >> 32n),
    ];
    const fields = new Map<number, number>([
      [OBJECT_FIELDS.ENTRY.offset, itemId],
      [ITEM_FIELDS.STACK_COUNT.offset, count],
    ]);
    for (const offset of [
      ITEM_FIELDS.OWNER.offset,
      ITEM_FIELDS.CONTAINED.offset,
    ])
      for (const [i, word] of guidWords(self).entries())
        fields.set(offset + i, word);
    entities.update(item, {}, fields);
    const pack = PLAYER_FIELDS.PACK_SLOT_1.offset + (slot - 23) * 2;
    entities.update(
      self,
      {},
      new Map(guidWords(item).map((word, i) => [pack + i, word])),
    );
    store.observeQuestLog();
  };
  const advance = (ms: number) => {
    clock += ms;
  };
  return {
    advance,
    bodies,
    carry,
    dispatch,
    entities,
    events,
    logQuest,
    packet,
    runtime,
    sent,
    store,
    trainer: stores.trainer,
    vendor: stores.vendor,
  };
}
