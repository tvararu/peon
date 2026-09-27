import { type EntityLookup, isUnit, type UnitEntity } from "#wow/entity-store";
import type {
  FactionRelation,
  FactionTemplateCatalog,
} from "#wow/faction-template";

export type RelationDeps = {
  entity: EntityLookup;
  factions: () => FactionTemplateCatalog | undefined;
};

export function targetRelation(
  deps: RelationDeps,
  guid: bigint,
  selfGuid: bigint,
): FactionRelation {
  const target = deps.entity(guid);
  const self = deps.entity(selfGuid);
  if (!(isUnit(target) && isUnit(self))) return "unknown";
  return unitRelation(deps.factions(), self, target);
}

function unitRelation(
  factions: FactionTemplateCatalog | undefined,
  self: UnitEntity,
  target: UnitEntity,
): FactionRelation {
  if (!factions) return "unknown";
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
