import { Emitter, type Unsubscribe } from "#lib/emitter";
import { fieldOf, isUnit } from "#wow/entity-store";
import { distance } from "#wow/geometry";
import {
  type CharterOffer,
  type PetitionSignatures,
  type QueryResponse,
  type Showlist,
} from "#wow/areas/charters/protocol";
import { readInventory } from "#wow/inventory";
import { type BuyItemFailure, buyResultName } from "#wow/protocol/vendor";
import {
  type InventoryChangeFailure,
  type InventoryClaim,
  inventoryResultName,
  ownsInventoryFailure,
} from "#wow/protocol/inventory";
import type { ItemPushResult } from "#wow/protocol/loot";
import { ITEM_FIELDS, PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export const GUILD_CHARTER_ENTRY = 5863;
export const ARENA_CHARTER_ENTRIES = [23560, 23561, 23562] as const;
export const CHARTER_ENTRIES = [
  GUILD_CHARTER_ENTRY,
  ...ARENA_CHARTER_ENTRIES,
] as const;
export const PETITIONER_NPC_FLAG = 0x4_00_00;
export const CHARTER_YARDS = 5.5;

export type CharterPetition = {
  item: bigint;
  id: number;
  owner: bigint;
  name: string;
  kind: "guild" | "arena";
  needed: number;
  maxSigns: number;
  signers: bigint[];
};

export type CharterRequest =
  | { kind: "showlist"; npc: bigint; entries?: number[] | undefined; requestedAt: number }
  | { kind: "buy"; npc: bigint; name: string; index: number; entries: number[]; before: bigint[]; requestedAt: number }
  | { kind: "query"; item: bigint; petition: number | undefined; requestedAt: number }
  | { kind: "signatures"; item: bigint; requestedAt: number }
  | { kind: "rename"; item: bigint; name: string; requestedAt: number };

export type CharterResult =
  | { status: "ok"; item?: bigint | undefined }
  | { status: "refused"; reason: string }
  | { status: "no_reply" };

export type CharterOutcome = CharterResult & {
  request: CharterRequest;
  observedAt: number;
};

export type PendingOffer = {
  item: bigint;
  owner: bigint;
  petition: number;
  signers: bigint[];
};

export type ChartersState = {
  offers: Record<string, CharterOffer[]>;
  petitions: Record<string, CharterPetition>;
  pendingOffer: PendingOffer | undefined;
  pending: CharterRequest | undefined;
  lastOutcome: CharterOutcome | undefined;
};

export type ChartersEvent =
  | { type: "showlist"; npc: bigint; entries: CharterOffer[] }
  | { type: "query"; item: bigint; petition: CharterPetition }
  | { type: "signatures"; item: bigint; signers: bigint[]; offered: boolean }
  | { type: "renamed"; item: bigint; name: string }
  | { type: "bought"; npc: bigint; item: bigint | undefined; name: string }
  | { type: "refused"; kind: CharterRequest["kind"]; reason: string }
  | { type: "unanswered"; kind: CharterRequest["kind"] };

const COMMAND_CREATE = 0;
const COMMAND_NAMES: Record<number, string> = {
  6: "name_invalid",
  7: "name_taken",
};

function keyOf(guid: bigint): string {
  return `0x${guid.toString(16)}`;
}

const UNCLAIMED: InventoryClaim = { itemGuid: undefined };

function legacyClaims(core: CoreStores): (InventoryClaim | undefined)[] {
  const destroy = core.destroy.pending;
  const buy = core.vendor.pending?.action === "buy";
  const quest = core.quests.pending?.action;
  const take = core.rewards.pending?.action === "take";
  return [
    destroy && { itemGuid: destroy.itemGuid },
    buy ? UNCLAIMED : undefined,
    quest === "accept" || quest === "chooseReward" ? UNCLAIMED : undefined,
    take ? UNCLAIMED : undefined,
  ];
}

function isCharterEntry(entry: number | undefined): boolean {
  if (entry === undefined) return false;
  return (CHARTER_ENTRIES as readonly number[]).includes(entry);
}

function commandReason(result: number): string {
  return COMMAND_NAMES[result] ?? `command_result_${result}`;
}

export class ChartersStore {
  private readonly events = new Emitter<[ChartersEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private readonly outcomes = new Map<CharterRequest, CharterResult>();
  private readonly offers = new Map<string, CharterOffer[]>();
  private readonly petitions = new Map<string, CharterPetition>();
  private offer: PendingOffer | undefined;
  private request: CharterRequest | undefined;
  private last: CharterOutcome | undefined;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): ChartersState {
    return {
      lastOutcome: this.last,
      offers: Object.fromEntries(this.offers),
      pending: this.request,
      pendingOffer: this.offer,
      petitions: Object.fromEntries(this.petitions),
    };
  }

  onEvent(cb: (event: ChartersEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  reach(npc: bigint): number | undefined {
    const other = this.deps.getEntity(npc);
    const self = this.deps.getEntity(this.deps.selfGuid());
    const from = self?.position;
    const to = other?.position;
    if (!(other && from && to)) return undefined;
    return distance({ x: from.x, y: from.y, z: from.z }, { x: to.x, y: to.y, z: to.z });
  }

  petitioner(npc: bigint): boolean | undefined {
    const entity = this.deps.getEntity(npc);
    const flags = isUnit(entity) ? entity.npcFlags : undefined;
    if (flags === undefined) return undefined;
    return (flags & PETITIONER_NPC_FLAG) !== 0;
  }

  guildId(): number | undefined {
    return fieldOf(
      this.deps.getEntity(this.deps.selfGuid()),
      PLAYER_FIELDS.GUILDID.offset,
    );
  }

  charterItems(): bigint[] {
    const inventory = readInventory(this.deps.selfGuid(), this.deps.getEntity);
    const guids: bigint[] = [];
    for (const slot of [...inventory.slots, ...(inventory.bank?.slots ?? [])]) {
      if (slot.status !== "occupied") continue;
      if (!isCharterEntry(slot.item.entry)) continue;
      guids.push(slot.guid);
    }
    return guids;
  }

  petitionIdOf(item: bigint): number | undefined {
    return fieldOf(
      this.deps.getEntity(item),
      ITEM_FIELDS.ENCHANTMENT_1_1.offset,
    );
  }

  entriesOf(npc: bigint): number[] {
    return (
      this.offers.get(keyOf(npc))?.map((entry) => entry.entry) ?? [
        ...CHARTER_ENTRIES,
      ]
    );
  }

  begin(request: CharterRequest): void {
    if (this.request) throw new Error("a charters request is already pending");
    this.request = request;
    this.last = undefined;
  }

  receiveShowlist(packet: Showlist): void {
    const key = keyOf(packet.npc);
    this.offers.set(key, [...packet.entries]);
    const request = this.request;
    if (request?.kind === "showlist" && request.npc === packet.npc)
      this.settle({ status: "ok" }, { entries: [...packet.entries], npc: packet.npc, type: "showlist" });
    else this.events.emit({ entries: [...packet.entries], npc: packet.npc, type: "showlist" });
  }

  receiveQueryResponse(response: QueryResponse): void {
    const request = this.request;
    const item =
      request?.kind === "query"
        ? request.item
        : this.guidOfPetition(response.id);
    if (item === undefined) return;
    const petition: CharterPetition = {
      id: response.id,
      item,
      kind: response.kind,
      maxSigns: response.maxSigns,
      name: response.name,
      needed: response.minSigns,
      owner: response.owner,
      signers: this.petitions.get(keyOf(item))?.signers ?? [],
    };
    this.petitions.set(keyOf(item), petition);
    if (request?.kind === "query" && request.item === item)
      this.settle({ item, status: "ok" }, { item, petition, type: "query" });
  }

  receiveSignatures(packet: PetitionSignatures): void {
    const held = this.charterItems().includes(packet.item);
    if (!held) {
      this.offer = {
        item: packet.item,
        owner: packet.owner,
        petition: packet.petition,
        signers: [...packet.signers],
      };
    }
    const known = this.petitions.get(keyOf(packet.item));
    if (known) {
      const updated = { ...known, signers: [...packet.signers] };
      this.petitions.set(keyOf(packet.item), updated);
    }
    const request = this.request;
    if (request?.kind === "signatures" && request.item === packet.item)
      this.settle({ item: packet.item, status: "ok" }, {
        item: packet.item,
        offered: !held,
        signers: [...packet.signers],
        type: "signatures",
      });
    else this.events.emit({ item: packet.item, offered: !held, signers: [...packet.signers], type: "signatures" });
  }

  receiveRename(item: bigint, name: string): void {
    const known = this.petitions.get(keyOf(item));
    if (known) this.petitions.set(keyOf(item), { ...known, name });
    const request = this.request;
    if (request?.kind === "rename" && request.item === item)
      this.settle({ item, status: "ok" }, { item, name, type: "renamed" });
    else this.events.emit({ item, name, type: "renamed" });
  }

  receiveItemPush(push: ItemPushResult): void {
    const request = this.request;
    if (request?.kind !== "buy") return;
    if (push.guid !== this.deps.selfGuid()) return;
    if (!request.entries.includes(push.itemId)) return;
    const item = this.resolveBought(request, push);
    this.settle({ item, status: "ok" }, { item, name: request.name, npc: request.npc, type: "bought" });
  }

  receiveBuyFailure(failure: BuyItemFailure): void {
    const request = this.request;
    if (request?.kind !== "buy") return;
    if (failure.vendorGuid !== 0n && failure.vendorGuid !== request.npc)
      return;
    const mine =
      failure.itemId === 0 ||
      request.entries.includes(failure.itemId);
    if (mine) this.refuse(buyResultName(failure.result));
  }

  receiveCommandResult(command: number, result: number): void {
    if (command !== COMMAND_CREATE || result === 0) return;
    this.refuse(commandReason(result));
  }

  receiveInventoryFailure(packet: InventoryChangeFailure): void {
    const request = this.request;
    if (!request || packet.kind !== "error") return;
    if (!ownsInventoryFailure(packet, UNCLAIMED, legacyClaims(this.core)))
      return;
    this.refuse(inventoryResultName(packet.result));
  }

  refuse(reason: string): void {
    const request = this.request;
    if (!request) return;
    this.settle({ reason, status: "refused" }, { kind: request.kind, reason, type: "refused" });
  }

  expire(): void {
    const request = this.request;
    if (!request) return;
    this.settle({ status: "no_reply" }, { kind: request.kind, type: "unanswered" });
  }

  resultOf(request: CharterRequest): CharterResult | undefined {
    return this.outcomes.get(request);
  }

  takeResult(request: CharterRequest): CharterResult | undefined {
    const result = this.outcomes.get(request);
    this.outcomes.delete(request);
    return result;
  }

  abandon(): void {
    if (this.request) this.outcomes.delete(this.request);
    this.request = undefined;
  }

  dispose(): void {
    this.abandon();
    this.outcomes.clear();
    this.events.clear();
  }

  private guidOfPetition(id: number): bigint | undefined {
    return this.charterItems().find((item) => this.petitionIdOf(item) === id);
  }

  private resolveBought(
    request: Extract<CharterRequest, { kind: "buy" }>,
    push: ItemPushResult,
  ): bigint | undefined {
    const inventory = readInventory(this.deps.selfGuid(), this.deps.getEntity);
    const held = [...inventory.slots, ...(inventory.bank?.slots ?? [])].find(
      (slot) =>
        slot.status === "occupied" &&
        slot.bag === push.bagSlot &&
        slot.slot === push.slot &&
        slot.item.entry === push.itemId,
    );
    if (held?.status === "occupied") return held.guid;
    return this.charterItems().find((item) => !request.before.includes(item));
  }

  private settle(result: CharterResult, event: ChartersEvent): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, request, observedAt: this.deps.now() };
    this.outcomes.set(request, result);
    this.request = undefined;
    this.events.emit(event);
  }
}
