import type {
  LfgList,
  LfgListGroup,
  LfgListInstance,
  LfgListPlayer,
} from "#wow/areas/lfg/protocol-list";

export type LfgRaidList = {
  dungeon: number;
  groups: readonly LfgListGroup[];
  players: readonly LfgListPlayer[];
  at: number;
};

export type LfgRaidListEvent = {
  type: "raid_list";
  dungeon: number;
  form: "full" | "difference";
};

function copyInstance(
  instance: LfgListInstance | undefined,
): LfgListInstance | undefined {
  return instance === undefined ? undefined : { ...instance };
}

function copyGroup(group: LfgListGroup): LfgListGroup {
  return { ...group, instance: copyInstance(group.instance) };
}

function copyPlayer(player: LfgListPlayer): LfgListPlayer {
  return {
    ...player,
    character:
      player.character === undefined
        ? undefined
        : { ...player.character, talents: [...player.character.talents] },
    instance: copyInstance(player.instance),
  };
}

function merge<T extends { guid: bigint }>(
  current: readonly T[],
  deleted: ReadonlySet<bigint>,
  incoming: readonly T[],
): T[] {
  const next = new Map<bigint, T>();
  for (const entry of current)
    if (!deleted.has(entry.guid)) next.set(entry.guid, entry);
  for (const entry of incoming) next.set(entry.guid, entry);
  return [...next.values()];
}

export class LfgRaidLists {
  private readonly lists = new Map<number, LfgRaidList>();
  private readonly now: () => number;
  private readonly emit: (event: LfgRaidListEvent) => void;

  constructor(now: () => number, emit: (event: LfgRaidListEvent) => void) {
    this.now = now;
    this.emit = emit;
  }

  receive(list: LfgList): void {
    const base = list.difference ? this.lists.get(list.dungeon) : undefined;
    const deleted = new Set(list.deleted);
    this.lists.set(list.dungeon, {
      dungeon: list.dungeon,
      groups: merge(base?.groups ?? [], deleted, list.groups),
      players: merge(base?.players ?? [], deleted, list.players),
      at: this.now(),
    });
    this.emit({
      type: "raid_list",
      dungeon: list.dungeon,
      form: list.difference ? "difference" : "full",
    });
  }

  snapshot(): Record<number, LfgRaidList> {
    const copy: Record<number, LfgRaidList> = {};
    for (const [dungeon, list] of this.lists)
      copy[dungeon] = {
        ...list,
        groups: list.groups.map(copyGroup),
        players: list.players.map(copyPlayer),
      };
    return copy;
  }
}
