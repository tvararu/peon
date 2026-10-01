import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  PetFeedback,
  PetNameInvalid,
  PetNameQueryResponse,
  PetTameFailure,
  StabledPets,
  StablePet,
  StableResult,
} from "#wow/areas/pets/protocol";
import { type PetView, petView } from "#wow/areas/pets/view";
import type { EntityLookup } from "#wow/entity-store";
import { joinGuid } from "#wow/protocol/packet";
import {
  isPetBarClear,
  type PetBar,
  type PetBarClear,
  type PetCooldown,
  type PetSlot,
} from "#wow/protocol/pet-spells";
import type {
  CastFailed,
  CooldownNotice,
  SpellCooldown,
} from "#wow/protocol/spell";
import { spellCastReason } from "#wow/protocol/spell-cast-result";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type PetReact = "passive" | "defensive" | "aggressive" | "unknown";
export type PetCommand = "stay" | "follow" | "attack" | "abandon" | "unknown";
export type PetAutocast = "on" | "off" | "passive";
export type PetsSpell = { spell: number; autocast: PetAutocast };
export type PetsBar = {
  guid: bigint;
  family: number;
  durationMs: number;
  react: PetReact;
  command: PetCommand;
  flags: number;
  slots: readonly PetSlot[];
  spells: readonly PetsSpell[];
  receivedAt: number;
};
export type PetsCooldown = {
  spell: number;
  category: number;
  readyAt: number | undefined;
  infinite: boolean;
};
export type PetsRefusal = { reason: string; at: number };
export type PetName = {
  number: number;
  name: string;
  timestamp: number;
  declined: readonly string[] | undefined;
};
export type StableState = {
  npc: bigint;
  slots: number;
  pets: readonly StablePet[];
  stale: boolean;
};
export type StableResultEvent = {
  type: "stable_result";
  code: number;
  result: StableResult;
};
export type TameFailedEvent = {
  type: "tame_failed";
  code: number;
  reason: PetTameFailure;
};
export type PetsState = {
  bar: PetsBar | undefined;
  cooldowns: readonly PetsCooldown[];
  lastRefusal: PetsRefusal | undefined;
  pet: PetView | undefined;
  names: Readonly<Record<number, PetName>>;
  renamePending: readonly number[];
  stable: StableState | undefined;
};
export type PetsEvent =
  | { type: "bar"; cleared: false; bar: PetsBar }
  | { type: "bar"; cleared: true }
  | { type: "spell_learned"; spell: number }
  | { type: "spell_unlearned"; spell: number }
  | { type: "feedback"; reason: PetFeedback }
  | { type: "cast_failed"; spell: number; reason: string; castCount: number }
  | { type: "name"; name: PetName }
  | {
      type: "name_invalid";
      reason: PetNameInvalid["reason"];
      name: string;
      declined: readonly string[] | undefined;
    }
  | { type: "stable_list"; stable: StableState }
  | StableResultEvent
  | TameFailedEvent
  | { type: "unanswered"; request: "rename" | "stable" };

const REACTS: readonly PetReact[] = ["passive", "defensive", "aggressive"];
const COMMANDS: readonly PetCommand[] = ["stay", "follow", "attack", "abandon"];
const AUTOCAST_ON = 0xc1;
const PASSIVE = 0x01;

function autocastOf(type: number): PetAutocast {
  if (type === AUTOCAST_ON) return "on";
  return type === PASSIVE ? "passive" : "off";
}

function cooldownOf(wire: PetCooldown, now: number): PetsCooldown {
  return {
    spell: wire.spell,
    category: wire.category,
    readyAt: wire.infinite
      ? undefined
      : now + Math.max(wire.cooldownMs, wire.categoryCooldownMs),
    infinite: wire.infinite,
  };
}

export class PetsStore {
  private readonly events = new Emitter<[PetsEvent]>();
  private readonly deps: SessionDeps;
  private readonly now: () => number;
  private readonly selfGuid: () => bigint;
  private readonly getEntity: EntityLookup;
  private current: PetsBar | undefined;
  private cooldowns: PetsCooldown[] = [];
  private lastRefusal: PetsRefusal | undefined;
  private names: Record<number, PetName> = {};
  private pending: number[] = [];
  private listing: StableState | undefined;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.deps = deps;
    this.now = deps.now;
    this.selfGuid = deps.selfGuid;
    this.getEntity = deps.getEntity;
  }

  critter(): bigint {
    const raw = this.deps.getEntity(this.deps.selfGuid())?.rawFields;
    if (!raw) return 0n;
    return joinGuid(
      raw.get(UNIT_FIELDS.CRITTER.offset) ?? 0,
      raw.get(UNIT_FIELDS.CRITTER.offset + 1) ?? 0,
    );
  }

  snapshot(): PetsState {
    const now = this.now();
    return {
      bar: this.current,
      cooldowns: this.cooldowns.filter(
        (row) => row.readyAt === undefined || row.readyAt > now,
      ),
      lastRefusal: this.lastRefusal,
      names: { ...this.names },
      renamePending: [...this.pending],
      pet: petView(this.getEntity, this.selfGuid()),
      stable: this.listing
        ? {
            npc: this.listing.npc,
            pets: [...this.listing.pets],
            slots: this.listing.slots,
            stale: this.listing.stale,
          }
        : undefined,
    };
  }

  onEvent(cb: (event: PetsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  bar(wire: PetBar | PetBarClear): void {
    if (isPetBarClear(wire)) {
      this.current = undefined;
      this.cooldowns = [];
      this.pending = [];
      this.events.emit({ type: "bar", cleared: true });
      return;
    }
    const now = this.now();
    const bar: PetsBar = {
      guid: wire.guid,
      family: wire.family,
      durationMs: wire.durationMs,
      react: REACTS[wire.react] ?? "unknown",
      command: COMMANDS[wire.command] ?? "unknown",
      flags: wire.flags,
      slots: wire.slots,
      spells: wire.spells.map((row) => ({
        spell: row.action,
        autocast: autocastOf(row.type),
      })),
      receivedAt: now,
    };
    this.current = bar;
    this.cooldowns = wire.cooldowns.map((row) => cooldownOf(row, now));
    this.events.emit({ type: "bar", cleared: false, bar });
  }

  learned(spell: number): void {
    const bar = this.current;
    if (bar && !bar.spells.some((row) => row.spell === spell))
      this.current = {
        ...bar,
        spells: [...bar.spells, { spell, autocast: "off" }],
      };
    this.events.emit({ type: "spell_learned", spell });
  }

  unlearned(spell: number): void {
    const bar = this.current;
    if (bar)
      this.current = {
        ...bar,
        spells: bar.spells.filter((row) => row.spell !== spell),
      };
    this.events.emit({ type: "spell_unlearned", spell });
  }

  feedback(reason: PetFeedback): void {
    this.lastRefusal = { reason, at: this.now() };
    this.events.emit({ type: "feedback", reason });
  }

  castFailed(failed: CastFailed): void {
    const reason = spellCastReason(failed.result);
    this.lastRefusal = { reason, at: this.now() };
    this.events.emit({
      castCount: failed.castCount,
      reason,
      spell: failed.spellId,
      type: "cast_failed",
    });
  }

  cooldown(packet: SpellCooldown): void {
    const bar = this.current;
    if (!bar || packet.guid !== bar.guid) return;
    const now = this.now();
    const rows = [...this.cooldowns];
    for (const entry of packet.cooldowns) {
      const readyAt = entry.time <= 0 ? now : now + entry.time;
      const at = rows.findIndex((row) => row.spell === entry.spellId);
      const category = at < 0 ? 0 : (rows[at]?.category ?? 0);
      const next = {
        category,
        infinite: false,
        readyAt,
        spell: entry.spellId,
      };
      if (at < 0) rows.push(next);
      else rows[at] = next;
    }
    this.cooldowns = rows;
  }

  clearCooldown(notice: CooldownNotice): void {
    const bar = this.current;
    if (!bar || notice.guid !== bar.guid) return;
    this.cooldowns = this.cooldowns.filter(
      (row) => row.spell !== notice.spellId,
    );
  }

  named(reply: PetNameQueryResponse): void {
    if (reply.name === "") return;
    const name: PetName = {
      declined: reply.declined,
      name: reply.name,
      number: reply.number,
      timestamp: reply.timestamp,
    };
    this.names = { ...this.names, [reply.number]: name };
    this.pending = this.pending.filter((row) => row !== reply.number);
    this.events.emit({ name, type: "name" });
  }

  refreshing(number: number): void {
    if (!this.pending.includes(number))
      this.pending = [...this.pending, number];
  }

  refreshed(number: number): void {
    this.pending = this.pending.filter((row) => row !== number);
  }

  nameRefused(refusal: PetNameInvalid): void {
    this.lastRefusal = { at: this.now(), reason: refusal.reason };
    this.events.emit({
      declined: refusal.declined,
      name: refusal.name,
      reason: refusal.reason,
      type: "name_invalid",
    });
  }

  nameStale(number: number, timestamp: number): boolean {
    const cached = this.names[number];
    return !cached || cached.timestamp < timestamp;
  }

  unanswered(): void {
    this.events.emit({ request: "rename", type: "unanswered" });
  }

  stable(reply: StabledPets): void {
    this.listing = {
      npc: reply.npc,
      pets: [...reply.pets],
      slots: reply.slots,
      stale: false,
    };
    this.events.emit({ stable: this.listing, type: "stable_list" });
  }

  tameFailed(code: number, reason: PetTameFailure): void {
    this.lastRefusal = { at: this.now(), reason };
    this.events.emit({ code, reason, type: "tame_failed" });
  }

  stableResult(code: number, result: StableResult): void {
    const listing = this.listing;
    if (
      listing &&
      (result === "stabled" ||
        result === "unstabled" ||
        result === "slot_bought")
    )
      this.listing = { ...listing, stale: true };
    if (result === "money" || result === "refused" || result === "exotic")
      this.lastRefusal = { at: this.now(), reason: result };
    this.events.emit({ code, result, type: "stable_result" });
  }

  unansweredStable(): void {
    this.events.emit({ request: "stable", type: "unanswered" });
  }

  dispose(): void {
    this.events.clear();
    this.current = undefined;
    this.cooldowns = [];
    this.names = {};
    this.pending = [];
    this.listing = undefined;
    this.lastRefusal = undefined;
  }
}
