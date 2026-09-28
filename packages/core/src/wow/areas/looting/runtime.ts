import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildLootMethod,
  buildOptOutOfLoot,
  LOOT_METHOD_NAMES,
  LOOT_THRESHOLD_NAMES,
  LOWEST_LOOT_THRESHOLD,
  type LootMethodName,
  type LootThresholdName,
} from "#wow/areas/looting/protocol";
import type { LootingEvent, LootingStore } from "#wow/areas/looting/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type LootMethodChoice = {
  method: LootMethodName;
  threshold: LootThresholdName;
  master: string;
};

export type LootingActs = {
  setPassOnLoot: (pass: boolean) => void;
  setLootMethod: (choice: LootMethodChoice) => void;
};

export function lootingRuntime(
  ctx: AreaRuntimeCtx<LootingEvent>,
  store: LootingStore,
): AreaRuntime<LootingActs> {
  function setPassOnLoot(pass: boolean): void {
    ctx.send(GameOpcode.CMSG_OPT_OUT_OF_LOOT, buildOptOutOfLoot(pass));
    store.setPassOnLoot(pass);
  }
  function masterGuid(name: string): bigint {
    if (name === "") return 0n;
    const found = ctx.legacy.party().members.find((m) => m.name === name);
    if (!found) throw new Error("not in your party");
    return found.guid;
  }
  function setLootMethod(choice: LootMethodChoice): void {
    const method = LOOT_METHOD_NAMES.indexOf(choice.method);
    if (method < 0) throw new Error(`unknown loot method: ${choice.method}`);
    const rank = LOOT_THRESHOLD_NAMES.indexOf(choice.threshold);
    if (rank < 0)
      throw new Error(`unknown loot threshold: ${choice.threshold}`);
    const master = masterGuid(choice.master);
    ctx.send(
      GameOpcode.CMSG_LOOT_METHOD,
      buildLootMethod(method, master, rank + LOWEST_LOOT_THRESHOLD),
    );
  }
  const off = ctx.listen("entity", (event) => {
    if (event.type === "disappear") store.forget(event.guid);
  });
  return { act: { setLootMethod, setPassOnLoot }, dispose: off };
}
