import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { LootList } from "#wow/areas/looting/protocol";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const LOOT_OWNER_LIMIT = 64;

export type LootMine = "yes" | "no" | "unknown";
export type LootOwner = { master: bigint; looter: bigint; mine: LootMine };
export type LootingState = {
  owners: ReadonlyMap<bigint, LootOwner>;
  masterCandidates: readonly bigint[];
  passOnLoot: boolean;
};
export type LootingEvent = {
  type: "loot_owner";
  creature: bigint;
  master: bigint;
  looter: bigint;
  mine: LootMine;
};

function mineOf(packet: LootList, self: bigint): LootMine {
  const { master, looter } = packet;
  if (self !== 0n && (master === self || looter === self)) return "yes";
  return master === 0n && looter === 0n ? "unknown" : "no";
}

export class LootingStore {
  private readonly events = new Emitter<[LootingEvent]>();
  private readonly owners = new Map<bigint, LootOwner>();
  private readonly selfGuid: () => bigint;
  private passOnLoot = false;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.selfGuid = deps.selfGuid;
  }

  snapshot(): LootingState {
    return {
      owners: new Map(
        [...this.owners].map(([creature, owner]) => [creature, { ...owner }]),
      ),
      masterCandidates: [],
      passOnLoot: this.passOnLoot,
    };
  }

  onEvent(cb: (event: LootingEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveLootList(packet: LootList): void {
    const owner: LootOwner = {
      master: packet.master,
      looter: packet.looter,
      mine: mineOf(packet, this.selfGuid()),
    };
    this.owners.delete(packet.creature);
    this.owners.set(packet.creature, owner);
    for (const oldest of this.owners.keys()) {
      if (this.owners.size <= LOOT_OWNER_LIMIT) break;
      this.owners.delete(oldest);
    }
    this.events.emit({
      type: "loot_owner",
      creature: packet.creature,
      ...owner,
    });
  }

  forget(creature: bigint): void {
    this.owners.delete(creature);
  }

  setPassOnLoot(pass: boolean): void {
    this.passOnLoot = pass;
  }

  dispose(): void {
    this.events.clear();
    this.owners.clear();
  }
}
