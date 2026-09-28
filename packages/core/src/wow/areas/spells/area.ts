import { defineArea } from "#wow/areas/contract";
import { SPELLS_OPCODES } from "#wow/areas/spells/opcodes";
import {
  parseChannelStart,
  parseChannelUpdate,
} from "#wow/areas/spells/protocol";
import { spellsRuntime } from "#wow/areas/spells/runtime";
import { SpellsStore } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseSpellFailure } from "#wow/protocol/spell";

export const spellsArea = defineArea({
  name: "spells",
  opcodes: SPELLS_OPCODES,
  eventTypes: ["channel_start", "channel_end"],
  store: (deps, core) => new SpellsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.MSG_CHANNEL_START, (r) =>
      store.channelStart(parseChannelStart(r)),
    );
    wire.on(GameOpcode.MSG_CHANNEL_UPDATE, (r) =>
      store.channelUpdate(parseChannelUpdate(r)),
    );
    wire.peek(GameOpcode.SMSG_SPELL_FAILURE, (r) =>
      store.spellFailure(parseSpellFailure(r)),
    );
  },
  runtime: spellsRuntime,
});
