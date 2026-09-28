import { type EntityLookup, isUnit, type UnitEntity } from "#wow/entity-store";
import type {
  FactionRelation,
  FactionTemplateCatalog,
} from "#wow/faction-template";
import { ObjectType } from "#wow/protocol/entity-fields";

export type ReputationRelationView = {
  forcedRank: (factionId: number) => number | undefined;
  reputationRank: (factionId: number) => number | undefined;
  atWar: (factionId: number) => boolean;
};

export type RelationDeps = {
  entity: EntityLookup;
  factions: () => FactionTemplateCatalog | undefined;
  reputation?: ReputationRelationView;
};

const REP_HOSTILE = 1;
const REP_NEUTRAL = 3;
const REP_FRIENDLY = 4;

export function targetRelation(
  deps: RelationDeps,
  guid: bigint,
  selfGuid: bigint,
): FactionRelation {
  const target = deps.entity(guid);
  const self = deps.entity(selfGuid);
  if (!(isUnit(target) && isUnit(self))) return "unknown";
  return unitRelation(deps, self, target);
}

export function reputationReaction(
  view: ReputationRelationView,
  factions: FactionTemplateCatalog,
  targetTemplate: number,
): number | undefined {
  const faction = factions.get(targetTemplate)?.faction;
  if (faction === undefined) return undefined;
  const forced = view.forcedRank(faction);
  if (forced !== undefined) return forced;
  const rank = view.reputationRank(faction);
  if (rank === undefined) return undefined;
  return view.atWar(faction) ? Math.min(rank, REP_NEUTRAL) : rank;
}

function rankRelation(rank: number): FactionRelation {
  if (rank <= REP_HOSTILE) return "hostile";
  if (rank >= REP_FRIENDLY) return "friendly";
  return "neutral";
}

function unitRelation(
  deps: RelationDeps,
  self: UnitEntity,
  target: UnitEntity,
): FactionRelation {
  const factions = deps.factions();
  if (!factions) return "unknown";
  if (deps.reputation && target.objectType !== ObjectType.PLAYER) {
    const rank = reputationReaction(
      deps.reputation,
      factions,
      target.factionTemplate,
    );
    if (rank !== undefined) return rankRelation(rank);
  }
  const toward = factions.relation(
    self.factionTemplate,
    target.factionTemplate,
  );
  const back = factions.relation(target.factionTemplate, self.factionTemplate);
  if (toward === "friendly" || back === "friendly") return "friendly";
  if (toward === "hostile" || back === "hostile") return "hostile";
  if (toward === "unknown" || back === "unknown") return "unknown";
  return "neutral";
}
