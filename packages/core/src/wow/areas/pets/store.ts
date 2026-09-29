import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { PetFeedback } from "#wow/areas/pets/protocol";
import { type PetView, petView } from "#wow/areas/pets/view";
import type { EntityLookup } from "#wow/entity-store";
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
export type PetsState = {
  bar: PetsBar | undefined;
  cooldowns: readonly PetsCooldown[];
  lastRefusal: PetsRefusal | undefined;
  pet: PetView | undefined;
};
export type PetsEvent =
  | { type: "bar"; cleared: false; bar: PetsBar }
  | { type: "bar"; cleared: true }
  | { type: "spell_learned"; spell: number }
  | { type: "spell_unlearned"; spell: number }
  | { type: "feedback"; reason: PetFeedback }
  | { type: "cast_failed"; spell: number; reason: string; castCount: number };

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
  private readonly now: () => number;
  private readonly selfGuid: () => bigint;
  private readonly getEntity: EntityLookup;
  private current: PetsBar | undefined;
  private cooldowns: PetsCooldown[] = [];
  private lastRefusal: PetsRefusal | undefined;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
    this.selfGuid = deps.selfGuid;
    this.getEntity = deps.getEntity;
  }

  snapshot(): PetsState {
    const now = this.now();
    return {
      bar: this.current,
      cooldowns: this.cooldowns.filter(
        (row) => row.readyAt === undefined || row.readyAt > now,
      ),
      lastRefusal: this.lastRefusal,
      pet: petView(this.getEntity, this.selfGuid()),
    };
  }

  onEvent(cb: (event: PetsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  bar(wire: PetBar | PetBarClear): void {
    if (isPetBarClear(wire)) {
      this.current = undefined;
      this.cooldowns = [];
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
      const next = {
        category: 0,
        infinite: false,
        readyAt,
        spell: entry.spellId,
      };
      const at = rows.findIndex((row) => row.spell === entry.spellId);
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

  dispose(): void {
    this.events.clear();
    this.current = undefined;
    this.cooldowns = [];
  }
}
