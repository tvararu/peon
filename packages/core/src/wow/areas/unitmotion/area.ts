import { defineArea } from "#wow/areas/contract";
import { UNITMOTION_OPCODES } from "#wow/areas/unitmotion/opcodes";
import { unitmotionRuntime } from "#wow/areas/unitmotion/runtime";
import { UnitmotionStore } from "#wow/areas/unitmotion/store";

export const unitmotionArea = defineArea({
  name: "unitmotion",
  opcodes: UNITMOTION_OPCODES,
  eventTypes: ["speed", "flag", "removed"],
  store: (deps, core) => new UnitmotionStore(deps, core),
  register: () => undefined,
  runtime: unitmotionRuntime,
});
