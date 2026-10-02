import { defineArea } from "#wow/areas/contract";
import { PETS_OPCODES } from "#wow/areas/pets/opcodes";
import {
  parsePetActionFeedback,
  parsePetActionSound,
  parsePetComboPoints,
  parsePetDismissSound,
  parsePetNameInvalid,
  parsePetNameQueryResponse,
  parsePetSpellId,
  parsePetTameFailure,
  parseStabledPets,
  parseStableResult,
} from "#wow/areas/pets/protocol";
import { petsRuntime } from "#wow/areas/pets/runtime";
import { PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parsePetSpells } from "#wow/protocol/pet-spells";
import {
  parseCastFailed,
  parseCooldownNotice,
  parseSpellCooldown,
} from "#wow/protocol/spell";

export const petsArea = defineArea({
  name: "pets",
  opcodes: PETS_OPCODES,
  eventTypes: [
    "bar",
    "spell_learned",
    "spell_unlearned",
    "feedback",
    "cast_failed",
    "combo_points",
    "name",
    "name_invalid",
    "stable_list",
    "stable_result",
    "tame_failed",
    "unanswered",
  ],
  store: (deps, core) => new PetsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_PET_SPELLS, (r) => store.bar(parsePetSpells(r)));
    wire.on(GameOpcode.SMSG_PET_LEARNED_SPELL, (r) =>
      store.learned(parsePetSpellId(r)),
    );
    wire.on(GameOpcode.SMSG_PET_UNLEARNED_SPELL, (r) =>
      store.unlearned(parsePetSpellId(r)),
    );
    wire.on(GameOpcode.SMSG_PET_ACTION_FEEDBACK, (r) =>
      store.feedback(parsePetActionFeedback(r)),
    );
    wire.on(GameOpcode.SMSG_PET_CAST_FAILED, (r) =>
      store.castFailed(parseCastFailed(r)),
    );
    wire.on(GameOpcode.SMSG_PET_UPDATE_COMBO_POINTS, (r) =>
      store.combo(parsePetComboPoints(r)),
    );
    wire.peek(GameOpcode.SMSG_SPELL_COOLDOWN, (r) =>
      store.cooldown(parseSpellCooldown(r)),
    );
    wire.peek(GameOpcode.SMSG_CLEAR_COOLDOWN, (r) =>
      store.clearCooldown(parseCooldownNotice(r)),
    );
    wire.on(GameOpcode.SMSG_PET_ACTION_SOUND, (r) => {
      parsePetActionSound(r);
    });
    wire.on(GameOpcode.SMSG_PET_DISMISS_SOUND, (r) => {
      parsePetDismissSound(r);
    });
    wire.on(GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE, (r) =>
      store.named(parsePetNameQueryResponse(r)),
    );
    wire.on(GameOpcode.SMSG_PET_NAME_INVALID, (r) =>
      store.nameRefused(parsePetNameInvalid(r)),
    );
    wire.on(GameOpcode.MSG_LIST_STABLED_PETS, (r) =>
      store.stable(parseStabledPets(r)),
    );
    wire.on(GameOpcode.SMSG_PET_TAME_FAILURE, (r) => {
      const parsed = parsePetTameFailure(r);
      store.tameFailed(parsed.code, parsed.reason);
    });
    wire.on(GameOpcode.SMSG_STABLE_RESULT, (r) => {
      const parsed = parseStableResult(r);
      store.stableResult(parsed.code, parsed.result);
    });
  },
  runtime: petsRuntime,
});
