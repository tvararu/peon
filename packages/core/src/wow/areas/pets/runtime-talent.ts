import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLearnPreviewTalentsPet,
  buildPetLearnTalent,
  type PetTalentPick,
} from "#wow/areas/pets/protocol";
import { NO_PET, type PetsActResult } from "#wow/areas/pets/runtime-abandon";
import type { PetsEvent, PetsStore } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const MAX_PREVIEW_TALENTS = 30;

export type TalentActs = {
  learnPetTalent: (talent: number, rank: number) => PetsActResult;
  learnPetTalents: (picks: readonly PetTalentPick[]) => PetsActResult;
};

type Ctx = AreaRuntimeCtx<PetsEvent>;

export function talentActs(ctx: Ctx, store: PetsStore): TalentActs {
  return {
    learnPetTalent: (talent, rank) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      ctx.send(
        GameOpcode.CMSG_PET_LEARN_TALENT,
        buildPetLearnTalent(bar.guid, talent, rank),
      );
      return { ok: true };
    },
    learnPetTalents: (picks) => {
      const { bar } = store.snapshot();
      if (!bar) return NO_PET;
      if (picks.length === 0) return { ok: false, reason: "empty_list" };
      if (picks.length > MAX_PREVIEW_TALENTS)
        return { ok: false, reason: "too_many" };
      ctx.send(
        GameOpcode.CMSG_LEARN_PREVIEW_TALENTS_PET,
        buildLearnPreviewTalentsPet(bar.guid, picks),
      );
      return { ok: true };
    },
  };
}
