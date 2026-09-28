import { defineArea } from "#wow/areas/contract";
import { PETS_OPCODES } from "#wow/areas/pets/opcodes";
import {
  parsePetActionFeedback,
  parsePetActionSound,
  parsePetDismissSound,
  parsePetSpellId,
} from "#wow/areas/pets/protocol";
import { petsRuntime } from "#wow/areas/pets/runtime";
import { PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parsePetSpells } from "#wow/protocol/pet-spells";

export const petsArea = defineArea({
  name: "pets",
  opcodes: PETS_OPCODES,
  eventTypes: ["bar", "spell_learned", "spell_unlearned", "feedback"],
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
    wire.on(GameOpcode.SMSG_PET_ACTION_SOUND, (r) => {
      parsePetActionSound(r);
    });
    wire.on(GameOpcode.SMSG_PET_DISMISS_SOUND, (r) => {
      parsePetDismissSound(r);
    });
  },
  runtime: petsRuntime,
});
