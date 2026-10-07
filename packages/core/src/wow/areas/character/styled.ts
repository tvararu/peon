import type {
  CharNameOutcome,
  CharStyleOutcome,
} from "#wow/areas/character/runtime";
import type { CharOperationResult } from "#wow/areas/character/store";

export function styled(
  outcome: CharOperationResult,
): CharStyleOutcome | CharNameOutcome {
  if (outcome.kind === "customize" || outcome.kind === "faction_change") {
    return {
      appearance: outcome.appearance,
      name: outcome.name,
      race: outcome.race,
      result: outcome.result,
    };
  }
  return { name: outcome.name, result: outcome.result };
}
