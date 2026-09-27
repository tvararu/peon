import type { EntityEvent } from "@tuicraft/core";
import type { LogClass } from "#harness/contract/log";
import {
  type Drafts,
  type RuleInput,
  type Tap,
  unitIds,
} from "#harness/events/rules";

const CAUSE: Record<Exclude<Tap, "mine">, string> = {
  none: "no credit to you",
  other: "killed by another player; no credit to you",
};

export function watchUnit(guid: bigint, rc: RuleInput): void {
  if (guid !== rc.selfGuid && guid !== 0n) rc.memo.watched.add(guid);
}

function diedClass(rc: RuleInput): LogClass {
  return rc.runActive ? "log" : "wake";
}

export function deathDrafts(event: EntityEvent, rc: RuleInput): Drafts {
  if (event.type === "disappear") {
    rc.memo.watched.delete(event.guid);
    return [];
  }
  if (event.type !== "update" || !event.changed.includes("health")) return [];
  const { entity } = event;
  if (!("health" in entity) || entity.health > 0) return [];
  if (!rc.memo.watched.delete(entity.guid)) return [];
  const by = rc.lookup.tapOf(entity.guid) ?? "none";
  if (by === "mine") return [];
  const name = rc.lookup.unitName(entity.guid) ?? entity.name ?? "A unit";
  const text = `${name} ${rc.refOf(entity.guid)} died (${CAUSE[by]}).`;
  return [
    {
      class: diedClass(rc),
      data: { by, name },
      domain: "combat",
      event: "combat/target_died",
      ...unitIds(entity.guid, rc),
      text,
    },
  ];
}
