import { defineArea } from "#wow/areas/contract";
import { SPELLS_OPCODES } from "#wow/areas/spells/opcodes";
import {
  parseChannelStart,
  parseChannelUpdate,
  parseConvertRune,
  parseModifyCooldown,
  parseSpellModifier,
  parseSpellVisual,
  parseTotemCreated,
  parseUnlearnSpells,
} from "#wow/areas/spells/protocol";
import { spellsRuntime } from "#wow/areas/spells/runtime";
import { SpellsStore } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  parseSpellFailure,
  parseSpellGo,
  parseSpellStart,
} from "#wow/protocol/spell";

export const spellsArea = defineArea({
  name: "spells",
  opcodes: SPELLS_OPCODES,
  eventTypes: [
    "channel_start",
    "channel_end",
    "spell_visual",
    "totem_created",
    "totem_gone",
    "unit_cast_start",
    "unit_cast_end",
    "skill_changed",
    "skill_removed",
    "rune_converted",
  ],
  store: (deps, core) => new SpellsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.MSG_CHANNEL_START, (r) =>
      store.channelStart(parseChannelStart(r)),
    );
    wire.on(GameOpcode.MSG_CHANNEL_UPDATE, (r) =>
      store.channelUpdate(parseChannelUpdate(r)),
    );
    wire.on(GameOpcode.SMSG_SEND_UNLEARN_SPELLS, (r) =>
      store.unlearnSpells(parseUnlearnSpells(r)),
    );
    wire.on(GameOpcode.SMSG_SET_FLAT_SPELL_MODIFIER, (r) =>
      store.spellModifier("flat", parseSpellModifier(r)),
    );
    wire.on(GameOpcode.SMSG_SET_PCT_SPELL_MODIFIER, (r) =>
      store.spellModifier("pct", parseSpellModifier(r)),
    );
    wire.on(GameOpcode.SMSG_MODIFY_COOLDOWN, (r) =>
      store.modifyCooldown(parseModifyCooldown(r)),
    );
    wire.on(GameOpcode.SMSG_PLAY_SPELL_VISUAL, (r) =>
      store.spellVisual(parseSpellVisual(r), false),
    );
    wire.on(GameOpcode.SMSG_PLAY_SPELL_IMPACT, (r) =>
      store.spellVisual(parseSpellVisual(r), true),
    );
    wire.on(GameOpcode.SMSG_TOTEM_CREATED, (r) =>
      store.totemCreated(parseTotemCreated(r)),
    );
    wire.on(GameOpcode.SMSG_CONVERT_RUNE, (r) =>
      store.convertRune(parseConvertRune(r)),
    );
    wire.peek(GameOpcode.SMSG_SPELL_FAILURE, (r) =>
      store.spellFailure(parseSpellFailure(r)),
    );
    wire.peek(GameOpcode.SMSG_SPELL_START, (r) =>
      store.spellStart(parseSpellStart(r)),
    );
    wire.peek(GameOpcode.SMSG_SPELL_GO, (r) => store.spellGo(parseSpellGo(r)));
    wire.on(GameOpcode.SMSG_SPELL_FAILED_OTHER, (r) =>
      store.spellFailure(parseSpellFailure(r)),
    );
  },
  runtime: spellsRuntime,
});
