import { Emitter, type Unsubscribe } from "#lib/emitter";
import { distance } from "#wow/geometry";
import type {
  GuildBankList,
  GuildBankLog,
  GuildBankSlot,
  GuildBankTabBrief,
  GuildBankText,
} from "#wow/areas/guildbank/protocol";
import type { InventoryState } from "#wow/inventory";
import { readInventory } from "#wow/inventory";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { SessionDeps } from "#wow/session-stores";

export const GUILD_BANK_OBJECT_TYPE = 34;
export const GUILD_BANK_YARDS = 10;

export type GuildBankItem = {
  entry: number;
  count: number;
  charges: number;
  enchant: number;
};

export type GuildBankTab = {
  brief: GuildBankTabBrief | undefined;
  items: ReadonlyMap<number, GuildBankItem>;
  text: string | undefined;
};

export type GuildBankState = {
  vault: bigint | undefined;
  money: bigint;
  tabs: number;
  items: ReadonlyMap<number, ReadonlyMap<number, GuildBankItem>>;
  briefs: readonly (GuildBankTabBrief | undefined)[];
  texts: readonly (string | undefined)[];
  logs: ReadonlyMap<number, GuildBankLog["entries"]>;
  moneyWithdrawn: number | undefined;
  tabWithdrawals: ReadonlyMap<number, number>;
  pending: GuildBankRequest | undefined;
  lastOutcome: GuildBankOutcome | undefined;
};

export type GuildBankRequest =
  | { kind: "open"; vault: bigint; requestedAt: number }
  | { kind: "query"; tab: number; requestedAt: number }
  | { kind: "buy"; tab: number; requestedAt: number }
  | { kind: "rename"; tab: number; requestedAt: number }
  | { kind: "deposit_money"; copper: number; requestedAt: number }
  | { kind: "withdraw_money"; copper: number; requestedAt: number }
  | {
      kind: "move";
      tab: number;
      slot: number;
      entry: number;
      count: number;
      requestedAt: number;
    }
  | { kind: "set_text"; tab: number; requestedAt: number }
  | { kind: "log"; tab: number; requestedAt: number }
  | { kind: "text"; tab: number; requestedAt: number }
  | { kind: "money_query"; requestedAt: number };

export type GuildBankResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "no_change" }
  | { status: "unanswered" };

export type GuildBankOutcome = GuildBankResult & {
  request: GuildBankRequest;
  observedAt: number;
};

export type GuildBankEvent =
  | { type: "opened"; vault: bigint; tabs: number }
  | { type: "tab"; tab: number; full: boolean }
  | { type: "tab_bought"; tab: number; tabs: number }
  | { type: "tab_renamed"; tab: number }
  | { type: "money_moved"; copper: number; money: bigint }
  | { type: "moved"; tab: number; slot: number }
  | { type: "text_set"; tab: number; text: string }
  | { type: "logged"; tab: number }
  | { type: "money_queried"; remaining: number }
  | { type: "refused"; kind: GuildBankRequest["kind"]; reason: string }
  | { type: "no_change"; kind: GuildBankRequest["kind"] }
  | { type: "unanswered"; kind: GuildBankRequest["kind"] };

function slotOf(item: GuildBankSlot): GuildBankItem {
  return {
    charges: item.charges,
    count: item.count,
    enchant: item.enchant,
    entry: item.entry,
  };
}

function briefOf(brief: GuildBankTabBrief): GuildBankTabBrief {
  return { icon: brief.icon, name: brief.name };
}

export class GuildBankStore {
  private readonly events = new Emitter<[GuildBankEvent]>();
  private readonly deps: SessionDeps;
  private readonly outcomes = new Map<GuildBankRequest, GuildBankResult>();
  private vault: bigint | undefined;
  private money = 0n;
  private tabs: (GuildBankTabBrief | undefined)[] = [];
  private items = new Map<number, Map<number, GuildBankItem>>();
  private texts = new Map<number, string>();
  private logs = new Map<number, GuildBankLog["entries"]>();
  private moneyLeft: number | undefined;
  private tabLeft = new Map<number, number>();
  private request: GuildBankRequest | undefined;
  private last: GuildBankOutcome | undefined;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): GuildBankState {
    return {
      briefs: [...this.tabs],
      items: new Map(
        [...this.items].map(([tab, slots]) => [
          tab,
          new Map(slots) as ReadonlyMap<number, GuildBankItem>,
        ]),
      ),
      lastOutcome: this.last,
      logs: new Map(this.logs),
      money: this.money,
      moneyWithdrawn: this.moneyLeft,
      pending: this.request,
      tabs: this.tabs.length,
      tabWithdrawals: new Map(this.tabLeft),
      texts: Array.from(
        { length: Math.max(this.tabs.length, ...[...this.texts.keys()]) + 1 },
        (_, i) => this.texts.get(i),
      ),
      vault: this.vault,
    };
  }

  onEvent(cb: (event: GuildBankEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  reach(vault: bigint): number | undefined {
    const object = this.deps.getEntity(vault);
    const self = this.deps.getEntity(this.deps.selfGuid());
    const from = self?.position;
    const to = object?.position;
    if (!(object && from && to)) return undefined;
    if (
      object.objectType !== ObjectType.GAMEOBJECT ||
      !("gameObjectType" in object)
    )
      return undefined;
    if (
      object.gameObjectType !== GUILD_BANK_OBJECT_TYPE &&
      (!("bytes1" in object) ||
        ((object.bytes1 >> 8) & 0xff) !== GUILD_BANK_OBJECT_TYPE)
    )
      return undefined;
    return distance(
      { x: from.x, y: from.y, z: from.z },
      { x: to.x, y: to.y, z: to.z },
    );
  }
  inventory(): InventoryState {
    return readInventory(this.deps.selfGuid(), this.deps.getEntity);
  }

  tab(tabId: number): GuildBankTab | undefined {
    if (tabId < 0 || tabId >= this.tabs.length) return undefined;
    const items = this.items.get(tabId) ?? new Map<number, GuildBankItem>();
    return {
      brief: this.tabs[tabId] && briefOf(this.tabs[tabId]),
      items: new Map(items),
      text: this.texts.get(tabId),
    };
  }

  log(tabId: number): GuildBankLog["entries"] | undefined {
    return this.logs.get(tabId);
  }

  begin(request: GuildBankRequest): void {
    if (this.request) throw new Error("a guild bank request is already pending");
    this.request = request;
    this.last = undefined;
  }

  receiveList(list: GuildBankList): void {
    this.money = list.money;
    if (list.tab === 0 && list.full && list.tabs.length > 0) {
      this.tabs = list.tabs.map(briefOf);
      this.vault = this.request?.kind === "open" ? this.request.vault : this.vault;
    }
    if (list.tab < this.tabs.length || this.tabs.length === 0) {
      while (this.tabs.length <= list.tab) this.tabs.push(undefined);
    }
    const slots = new Map<number, GuildBankItem>();
    for (const item of list.items) {
      if (item.entry === 0) continue;
      slots.set(item.slot, slotOf(item));
    }
    this.items.set(list.tab, slots);
    this.tabLeft.set(list.tab, list.withdrawals);
    if (this.request?.kind === "open") {
      this.settle({ status: "ok" }, { tabs: this.tabs.length, type: "opened", vault: this.vault ?? 0n });
      return;
    }
    if (this.settleBuy(list)) return;
    if (this.settleRename(list)) return;
    if (this.settleMoney(list)) return;
    const pending = this.request;
    if (pending?.kind === "query" && pending.tab === list.tab) {
      this.settle({ status: "ok" }, { full: list.full, tab: list.tab, type: "tab" });
      return;
    }
    if (pending?.kind === "move" && pending.tab === list.tab) {
      const seen = slots.get(pending.slot);
      if (seen && seen.entry === pending.entry && seen.count === pending.count)
        this.settle({ status: "ok" }, { slot: pending.slot, tab: pending.tab, type: "moved" });
      return;
    }
    this.events.emit({ full: list.full, tab: list.tab, type: "tab" });
  }

  private settleBuy(list: GuildBankList): boolean {
    const pending = this.request;
    if (pending?.kind !== "buy") return false;
    if (list.tab !== 0 || !list.full) return false;
    if (this.tabs.length > pending.tab) {
      this.settle({ status: "ok" }, { tab: pending.tab, tabs: this.tabs.length, type: "tab_bought" });
      return true;
    }
    return false;
  }

  private settleRename(list: GuildBankList): boolean {
    const pending = this.request;
    if (pending?.kind !== "rename") return false;
    if (list.tab !== 0 || !list.full) return false;
    this.settle({ status: "ok" }, { tab: pending.tab, type: "tab_renamed" });
    return true;
  }

  private settleMoney(list: GuildBankList): boolean {
    const pending = this.request;
    if (
      pending?.kind !== "deposit_money" &&
      pending?.kind !== "withdraw_money"
    )
      return false;
    if (list.tab !== 0 || !list.full) return false;
    this.settle(
      { status: "ok" },
      { copper: pending.copper, money: this.money, type: "money_moved" },
    );
    return true;
  }

  receiveLog(log: GuildBankLog): void {
    this.logs.set(log.tab, [...log.entries]);
    if (this.request?.kind === "log" && this.request.tab === log.tab)
      this.settle({ status: "ok" }, { tab: log.tab, type: "logged" });
    else this.events.emit({ tab: log.tab, type: "logged" });
  }

  receiveText(text: GuildBankText): void {
    this.texts.set(text.tab, text.text);
    const pending = this.request;
    if (
      (pending?.kind === "set_text" || pending?.kind === "text") &&
      pending.tab === text.tab
    )
      this.settle({ status: "ok" }, { tab: text.tab, text: text.text, type: "text_set" });
    else this.events.emit({ tab: text.tab, text: text.text, type: "text_set" });
  }

  receiveMoneyWithdrawn(remaining: number): void {
    this.moneyLeft = remaining;
    if (this.request?.kind === "money_query")
      this.settle({ status: "ok" }, { remaining, type: "money_queried" });
    else this.events.emit({ remaining, type: "money_queried" });
  }

  noteVault(vault: bigint): void {
    this.vault = vault;
  }

  refuse(reason: string): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "refused", reason },
      { kind: request.kind, reason, type: "refused" },
    );
  }

  noChange(): void {
    const request = this.request;
    if (!request) return;
    this.settle({ status: "no_change" }, { kind: request.kind, type: "no_change" });
  }

  expire(): void {
    const request = this.request;
    if (!request) return;
    this.settle(
      { status: "unanswered" },
      { kind: request.kind, type: "unanswered" },
    );
  }

  resultOf(request: GuildBankRequest): GuildBankResult | undefined {
    return this.outcomes.get(request);
  }

  takeResult(request: GuildBankRequest): GuildBankResult | undefined {
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

  private settle(result: GuildBankResult, event: GuildBankEvent): void {
    const request = this.request;
    if (!request) return;
    this.last = { ...result, observedAt: this.deps.now(), request };
    this.outcomes.set(request, result);
    this.request = undefined;
    this.events.emit(event);
  }
}
