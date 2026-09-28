import type { Entity } from "#wow/entity-store";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

export type TalentFields = {
  freePoints: number | undefined;
  slotTypes: readonly (number | undefined)[];
  glyphs: readonly (number | undefined)[];
  enabledMask: number | undefined;
};

export const GLYPH_SLOTS = PLAYER_FIELDS.GLYPHS_1.size;

function read(entity: Entity | undefined, offset: number) {
  return (
    entity?.rawFields.get(offset) ?? (entity?.createComplete ? 0 : undefined)
  );
}

function range(entity: Entity | undefined, offset: number) {
  return Array.from({ length: GLYPH_SLOTS }, (_, i) =>
    read(entity, offset + i),
  );
}

export function talentFields(
  deps: Pick<SessionDeps, "getEntity" | "selfGuid">,
): TalentFields {
  const guid = deps.selfGuid();
  const entity = guid ? deps.getEntity(guid) : undefined;
  return {
    freePoints: read(entity, PLAYER_FIELDS.CHARACTER_POINTS1.offset),
    slotTypes: range(entity, PLAYER_FIELDS.GLYPH_SLOTS_1.offset),
    glyphs: range(entity, PLAYER_FIELDS.GLYPHS_1.offset),
    enabledMask: read(entity, PLAYER_FIELDS.GLYPHS_ENABLED.offset),
  };
}
