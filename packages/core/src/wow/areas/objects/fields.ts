import type { Entity } from "#wow/entity-store";
import { extractGameObjectFields } from "#wow/protocol/extract-fields";

export type ObjectFields = {
  createdBy: bigint | undefined;
  dynFlags: number;
  pathProgress: number;
};

export function objectFields(entity: Pick<Entity, "rawFields">): ObjectFields {
  const fields = extractGameObjectFields(entity.rawFields);
  return {
    createdBy: fields.createdBy,
    dynFlags: fields.dynFlags ?? 0,
    pathProgress: fields.pathProgress ?? 0,
  };
}
