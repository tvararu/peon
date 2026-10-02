import { buildSetTitle } from "#wow/areas/achievements/protocol";
import type {
  AchievementStore,
  AchievementsEvent,
} from "#wow/areas/achievements/store";
import { MAX_TITLE_INDEX, readTitles } from "#wow/areas/achievements/titles";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { isUnit } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type SetTitleOutcome =
  | { ok: true; bit: number | undefined }
  | { ok: false; reason: "unknown_title" | "bad_title" };

export type AchievementsActs = {
  setTitle: (bit: number | undefined) => SetTitleOutcome;
};

export function achievementsRuntime(
  ctx: AreaRuntimeCtx<AchievementsEvent>,
  store: AchievementStore,
): AreaRuntime<AchievementsActs> {
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    const entity = event.entity;
    if (!(entity && isUnit(entity))) return;
    if (entity.guid !== ctx.selfGuid()) return;
    const { chosen, known } = readTitles(entity.rawFields);
    store.setTitles(known, chosen);
  });
  const setTitle = (bit: number | undefined): SetTitleOutcome => {
    if (bit === undefined) {
      ctx.send(GameOpcode.CMSG_SET_TITLE, buildSetTitle(undefined));
      return { bit: undefined, ok: true };
    }
    if (!Number.isInteger(bit) || bit <= 0 || bit >= MAX_TITLE_INDEX)
      return { ok: false, reason: "bad_title" };
    if (!store.knows(bit)) return { ok: false, reason: "unknown_title" };
    ctx.send(GameOpcode.CMSG_SET_TITLE, buildSetTitle(bit));
    return { bit, ok: true };
  };
  return {
    act: { setTitle },
    dispose: () => {
      off();
    },
  };
}
