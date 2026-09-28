import { defineArea } from "#wow/areas/contract";
import { LOOTING_OPCODES } from "#wow/areas/looting/opcodes";
import { parseLootList } from "#wow/areas/looting/protocol";
import { lootingRuntime } from "#wow/areas/looting/runtime";
import { LootingStore } from "#wow/areas/looting/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const lootingArea = defineArea({
  name: "looting",
  opcodes: LOOTING_OPCODES,
  eventTypes: ["loot_owner"],
  store: (deps, core) => new LootingStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_LOOT_LIST, (r) =>
      store.receiveLootList(parseLootList(r)),
    );
  },
  runtime: lootingRuntime,
});
