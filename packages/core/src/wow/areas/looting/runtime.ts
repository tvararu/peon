import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { buildOptOutOfLoot } from "#wow/areas/looting/protocol";
import type { LootingEvent, LootingStore } from "#wow/areas/looting/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type LootingActs = { setPassOnLoot: (pass: boolean) => void };

export function lootingRuntime(
  ctx: AreaRuntimeCtx<LootingEvent>,
  store: LootingStore,
): AreaRuntime<LootingActs> {
  function setPassOnLoot(pass: boolean): void {
    ctx.send(GameOpcode.CMSG_OPT_OUT_OF_LOOT, buildOptOutOfLoot(pass));
    store.setPassOnLoot(pass);
  }
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") store.forget(event.guid);
  });
  return { act: { setPassOnLoot }, dispose: off };
}
