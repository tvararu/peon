import { defineArea } from "#wow/areas/contract";
import { WINTERGRASP_OPCODES } from "#wow/areas/wintergrasp/opcodes";
import {
  parseBuildingDamage,
  parseEjected,
  parseEntered,
  parseEntryInvite,
  parseQueueInvite,
  parseQueueResponse,
} from "#wow/areas/wintergrasp/protocol";
import { wintergraspRuntime } from "#wow/areas/wintergrasp/runtime";
import { WintergraspStore } from "#wow/areas/wintergrasp/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const wintergraspArea = defineArea({
  name: "wintergrasp",
  opcodes: WINTERGRASP_OPCODES,
  eventTypes: [
    "wg_queue_offered",
    "wg_queued",
    "wg_entry_offered",
    "wg_entered",
    "wg_ejected",
    "building_damage",
  ],
  store: () => new WintergraspStore(),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_BATTLEFIELD_MGR_QUEUE_INVITE, (reader) => {
      store.receiveQueueInvite(parseQueueInvite(reader));
    });
    wire.on(
      GameOpcode.SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE,
      (reader) => {
        store.receiveQueueResponse(parseQueueResponse(reader));
      },
    );
    wire.on(GameOpcode.SMSG_BATTLEFIELD_MGR_ENTRY_INVITE, (reader) => {
      store.receiveEntryInvite(parseEntryInvite(reader));
    });
    wire.on(GameOpcode.SMSG_BATTLEFIELD_MGR_ENTERED, (reader) => {
      store.receiveEntered(parseEntered(reader));
    });
    wire.on(GameOpcode.SMSG_BATTLEFIELD_MGR_EJECTED, (reader) => {
      store.receiveEjected(parseEjected(reader));
    });
    wire.on(GameOpcode.SMSG_DESTRUCTIBLE_BUILDING_DAMAGE, (reader) => {
      store.receiveBuildingDamage(parseBuildingDamage(reader));
    });
  },
  runtime: wintergraspRuntime,
});
