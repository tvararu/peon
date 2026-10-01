import type { AreaRegister } from "#wow/areas/contract";
import { defineArea } from "#wow/areas/contract";
import { ITEMS_OPCODES } from "#wow/areas/items/opcodes";
import { parseItemNameResponse } from "#wow/areas/items/protocol-names";
import {
  parseItemTextResponse,
  parseReadItemResult,
} from "#wow/areas/items/protocol-read";
import {
  parseRefundInfo,
  parseRefundResult,
} from "#wow/areas/items/protocol-refund";
import {
  parseEquipmentSetList,
  parseEquipmentSetSaved,
  parseEquipmentSetUseResult,
} from "#wow/areas/items/protocol-sets";
import {
  parseEnchantmentLog,
  parseSocketGemsResult,
} from "#wow/areas/items/protocol-sockets";
import {
  parseItemCooldown,
  parseItemEnchantTimeUpdate,
  parseItemTimeUpdate,
  parseSetProficiency,
} from "#wow/areas/items/protocol-timers";
import { itemsRuntime } from "#wow/areas/items/runtime";
import { ItemsStore } from "#wow/areas/items/store";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";

function registerReads(wire: AreaRegister, store: ItemsStore): void {
  wire.peek(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, (r) =>
    store.receiveInventoryFailure(parseInventoryChangeFailure(r)),
  );
  wire.on(GameOpcode.SMSG_READ_ITEM_OK, (r) =>
    store.receiveReadOk(parseReadItemResult(r)),
  );
  wire.on(GameOpcode.SMSG_READ_ITEM_FAILED, (r) =>
    store.receiveReadFailed(parseReadItemResult(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_TEXT_QUERY_RESPONSE, (r) =>
    store.receiveItemText(parseItemTextResponse(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_NAME_QUERY_RESPONSE, (r) =>
    store.receiveItemName(parseItemNameResponse(r)),
  );
}

function registerTimers(wire: AreaRegister, store: ItemsStore): void {
  wire.on(GameOpcode.SMSG_ITEM_COOLDOWN, (r) =>
    store.receiveItemCooldown(parseItemCooldown(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_TIME_UPDATE, (r) =>
    store.receiveItemTime(parseItemTimeUpdate(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_ENCHANT_TIME_UPDATE, (r) =>
    store.receiveItemEnchantTime(parseItemEnchantTimeUpdate(r)),
  );
  wire.on(GameOpcode.SMSG_DURABILITY_DAMAGE_DEATH, () =>
    store.receiveDeathDurability(),
  );
  wire.on(GameOpcode.SMSG_SET_PROFICIENCY, (r) =>
    store.receiveProficiency(parseSetProficiency(r)),
  );
}

function registerSets(wire: AreaRegister, store: ItemsStore): void {
  wire.on(GameOpcode.SMSG_SOCKET_GEMS_RESULT, (r) =>
    store.receiveSocketResult(parseSocketGemsResult(r)),
  );
  wire.on(GameOpcode.SMSG_ENCHANTMENTLOG, (r) =>
    store.receiveEnchantmentLog(parseEnchantmentLog(r)),
  );
  wire.on(GameOpcode.SMSG_EQUIPMENT_SET_LIST, (r) =>
    store.receiveSetList(parseEquipmentSetList(r)),
  );
  wire.on(GameOpcode.SMSG_EQUIPMENT_SET_SAVED, (r) =>
    store.confirmSaved(
      parseEquipmentSetSaved(r),
      store.pendingSaveName()?.name ?? "",
      store.pendingSaveName()?.icon ?? "",
    ),
  );
  wire.on(GameOpcode.SMSG_EQUIPMENT_SET_USE_RESULT, (r) =>
    store.receiveUseResult(parseEquipmentSetUseResult(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_REFUND_INFO_RESPONSE, (r) =>
    store.receiveRefundInfo(parseRefundInfo(r)),
  );
  wire.on(GameOpcode.SMSG_ITEM_REFUND_RESULT, (r) =>
    store.receiveRefundResult(parseRefundResult(r)),
  );
}

export const itemsArea = defineArea({
  name: "items",
  opcodes: ITEMS_OPCODES,
  eventTypes: [
    "move_requested",
    "moved",
    "move_refused",
    "move_no_change",
    "move_unanswered",
    "item_received",
    "read_requested",
    "read_ok",
    "read_failed",
    "read_unanswered",
    "item_text",
    "set_item_name",
    "set_item_name_none",
    "item_cooldown",
    "item_timer",
    "item_enchant_timer",
    "durability_loss_death",
    "proficiency_changed",
    "enchantment_log",
    "sockets_updated",
    "socket_refused",
    "socket_unanswered",
    "sets_listed",
    "set_save_requested",
    "set_saved",
    "set_use_requested",
    "set_used",
    "set_deleted",
    "refund_info",
    "refund_info_none",
    "refund_result",
    "refund_unanswered",
  ],
  store: (deps, core) => new ItemsStore(deps, core),
  register: (wire, store) => {
    registerReads(wire, store);
    registerTimers(wire, store);
    registerSets(wire, store);
  },
  runtime: itemsRuntime,
});
