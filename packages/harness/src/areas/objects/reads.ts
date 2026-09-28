import {
  type AreaState,
  type Entity,
  extractGameObjectFields,
  type GameObjectEntity,
  type NearbyRow,
  ObjectType,
} from "@peon/core";
import type { ViewCtx } from "#harness/contract/services";
import { compassOf } from "#harness/ops/views";

const OBJECT_REF = /^o[1-9]\d*$/;

const GO_FLAG_LOCKED = 0x02;
const GO_FLAG_IN_USE = 0x01;
const GO_DYNFLAG_LO_ACTIVATE = 0x01;

const KIND_WORD: Record<number, string> = {
  0: "door",
  1: "button",
  2: "quest giver",
  3: "chest",
  4: "binder",
  5: "generic",
  6: "trap",
  7: "chair",
  8: "spell focus",
  9: "text",
  10: "usable",
  12: "area damage",
  13: "camera",
  14: "map object",
  15: "transport",
  16: "duel arbiter",
  17: "fishing node",
  18: "summoning ritual",
  19: "mailbox",
  21: "guard post",
  22: "spellcaster",
  23: "meeting stone",
  24: "flag stand",
  25: "fishing hole",
  26: "flag drop",
  27: "mini game",
  29: "capture point",
  30: "aura generator",
  31: "dungeon difficulty",
  32: "barber chair",
  33: "destructible building",
  34: "guild bank",
};

const REACH_YD: Record<number, number> = {
  0: 5,
  2: 5.555_555_3,
  4: 10,
  7: 3,
  9: 5.555_555_3,
  12: 0,
  13: 5,
  14: 5,
  15: 5,
  17: 100,
  19: 10,
  24: 5.555_555_3,
  25: 20.5,
  26: 5.555_555_3,
  27: 5.555_555_3,
  31: 5,
  32: 3,
  33: 5,
  34: 10,
};

export type ObjectRow = {
  ref: string;
  guid: bigint;
  entry: number;
  name: string;
  type: number;
  kind: string;
  distance: number | undefined;
  compass: string | undefined;
  x: number | undefined;
  y: number | undefined;
  z: number | undefined;
  quest: boolean;
  locked: boolean;
  busy: boolean;
};

type ObjectsState = AreaState<"objects">;

export function isGameObjectEntity(
  entity: Entity | undefined,
): entity is GameObjectEntity {
  return entity?.objectType === ObjectType.GAMEOBJECT;
}

export function objectRows({ handle, rt }: ViewCtx): ObjectRow[] {
  const { templates } = handle.objects.state() as ObjectsState;
  const rows = handle
    .queryNearby()
    .filter((row) => !row.self && isGameObjectEntity(row.entity));
  const seen = new Set<bigint>();
  const out: ObjectRow[] = [];
  for (const row of rows) {
    if (seen.has(row.entity.guid)) continue;
    seen.add(row.entity.guid);
    out.push(objectRow(templates, row, rt.refs.refOf(row.entity.guid)));
  }
  return out;
}

function objectRow(
  templates: ObjectsState["templates"],
  row: NearbyRow,
  ref: string,
): ObjectRow {
  const entity = row.entity as GameObjectEntity;
  const template = templates.get(entity.entry);
  const type = template?.type ?? entity.gameObjectType;
  const fields = extractGameObjectFields(entity.rawFields);
  const busy = entity.flags % (GO_FLAG_IN_USE * 2) >= GO_FLAG_IN_USE;
  const locked = entity.flags % (GO_FLAG_LOCKED * 2) >= GO_FLAG_LOCKED;
  const quest =
    (fields.dynFlags ?? 0) % (GO_DYNFLAG_LO_ACTIVATE * 2) >=
    GO_DYNFLAG_LO_ACTIVATE;
  return {
    busy,
    compass:
      row.bearingRadians === null ? undefined : compassOf(row.bearingRadians),
    distance: row.distance === null ? undefined : Math.round(row.distance),
    entry: entity.entry,
    guid: entity.guid,
    kind: KIND_WORD[type] ?? "object",
    locked,
    name: template?.name ?? entity.name ?? "unknown object",
    quest,
    ref,
    type,
    x: row.position?.x,
    y: row.position?.y,
    z: row.position?.z,
  };
}

export function reachYd(row: ObjectRow): number {
  return Math.max((REACH_YD[row.type] ?? 5.5) - 1, 1);
}

export function objectLine(row: ObjectRow): string {
  const flags = [
    row.quest ? "quest" : undefined,
    row.locked ? "locked" : undefined,
    row.busy ? "busy" : undefined,
  ].filter((flag) => flag !== undefined);
  const where =
    row.distance === undefined
      ? "distance unknown"
      : `${row.distance} yd${row.compass ? ` ${row.compass}` : ""}`;
  return [`- ${row.ref} ${row.name}, ${row.kind}`, ...flags, where].join(", ");
}

export function resolveObjectRef(
  ctx: ViewCtx,
  text: string,
): ObjectRow | undefined {
  const wanted = text.trim();
  const rows = objectRows(ctx);
  const byRef = rows.find((row) => row.ref === wanted);
  if (byRef) return byRef;
  const lower = wanted.toLowerCase();
  const named = rows.filter((row) => row.name.toLowerCase().includes(lower));
  if (named.length === 0) return undefined;
  const exact = named.filter((row) => row.name.toLowerCase() === lower);
  return (exact.length > 0 ? exact : named).sort(
    (a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9),
  )[0];
}

export function isObjectRef(text: string): boolean {
  return OBJECT_REF.test(text.trim());
}
