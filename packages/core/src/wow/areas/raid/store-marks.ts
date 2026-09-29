import type { RaidGroup } from "#wow/areas/raid/protocol";
import type { RaidTargetUpdate } from "#wow/areas/raid/protocol-marks";

export const MARK_COUNT = 8;

export type MarksEvent =
  | {
      type: "raid_mark";
      who: bigint;
      name: string;
      icon: number;
      target: bigint;
    }
  | { type: "raid_marks"; marks: readonly bigint[] }
  | { type: "minimap_ping"; who: bigint; name: string; x: number; y: number };

function emptyMarks(): bigint[] {
  return Array.from({ length: MARK_COUNT }, () => 0n);
}

function nameOf(group: RaidGroup | undefined, guid: bigint): string {
  return group?.members.find((member) => member.guid === guid)?.name ?? "";
}

export class MarkStore {
  private marks: readonly bigint[] = emptyMarks();

  current(): readonly bigint[] {
    return this.marks;
  }

  receive(
    group: RaidGroup | undefined,
    update: RaidTargetUpdate,
  ): MarksEvent | undefined {
    if (update.kind === "list") {
      const marks = emptyMarks();
      for (const entry of update.entries)
        if (entry.icon < MARK_COUNT) marks[entry.icon] = entry.target;
      this.marks = marks;
      return { marks, type: "raid_marks" };
    }
    if (update.icon >= MARK_COUNT) return undefined;
    this.marks = this.marks.map((guid, icon) => {
      if (icon === update.icon) return update.target;
      return update.target !== 0n && guid === update.target ? 0n : guid;
    });
    return {
      icon: update.icon,
      name: nameOf(group, update.who),
      target: update.target,
      type: "raid_mark",
      who: update.who,
    };
  }

  ping(
    group: RaidGroup | undefined,
    who: bigint,
    x: number,
    y: number,
  ): MarksEvent {
    return { name: nameOf(group, who), type: "minimap_ping", who, x, y };
  }

  clear(): void {
    this.marks = emptyMarks();
  }
}
