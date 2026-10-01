import { defineArea } from "#wow/areas/contract";
import { ITEMS_OPCODES } from "#wow/areas/items/opcodes";
import {
  parseItemTextResponse,
  parseReadItemResult,
} from "#wow/areas/items/protocol-read";
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
    "item_cooldown",
    "item_timer",
    "item_enchant_timer",
    "durability_loss_death",
    "proficiency_changed",
  ],
  store: (deps, core) => new ItemsStore(deps, core),
  register: (wire, store) => {
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
  },
  runtime: itemsRuntime,
});
