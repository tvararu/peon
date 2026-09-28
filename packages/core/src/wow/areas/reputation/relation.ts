import type { ReputationStore } from "#wow/areas/reputation/store";
import type { ReputationRelationView } from "#wow/unit-relation";

export function reputationRelationView(
  store: ReputationStore,
): ReputationRelationView {
  return {
    atWar: (factionId) => store.factionAtWar(factionId),
    forcedRank: (factionId) => store.forcedRank(factionId),
    reputationRank: (factionId) => store.factionRank(factionId),
  };
}
