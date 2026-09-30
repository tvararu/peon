export const TOTEM_SLOTS = 4;
export const TOTEM_ELEMENTS = ["fire", "earth", "water", "air"] as const;

export type TotemGoneReason = "gone" | "expired" | "destroyed" | "replaced";

export type Totem = {
  slot: number;
  guid: bigint;
  spellId: number;
  spellName: string | undefined;
  startedAt: number;
  durationMs: number;
};

export type TotemCreated = {
  type: "totem_created";
  slot: number;
  guid: bigint;
  spellId: number;
  spellName: string | undefined;
  durationMs: number;
};

export type TotemGone = {
  type: "totem_gone";
  slot: number;
  guid: bigint;
  spellId: number;
  spellName: string | undefined;
  reason: TotemGoneReason;
};

export type TotemEvent = TotemCreated | TotemGone;

export type TotemPacket = {
  slot: number;
  guid: bigint;
  durationMs: number;
  spellId: number;
};

export class Totems {
  private readonly slots = new Map<number, Totem>();
  private readonly destroying = new Set<number>();
  private readonly now: () => number;
  private readonly nameOf: (spellId: number) => string | undefined;
  private readonly emit: (event: TotemEvent) => void;

  constructor(
    now: () => number,
    nameOf: (spellId: number) => string | undefined,
    emit: (event: TotemEvent) => void,
  ) {
    this.now = now;
    this.nameOf = nameOf;
    this.emit = emit;
  }

  snapshot(): (Totem | undefined)[] {
    return Array.from({ length: TOTEM_SLOTS }, (_, slot) => {
      const totem = this.slots.get(slot);
      return totem && { ...totem };
    });
  }

  at(slot: number): Totem | undefined {
    return this.slots.get(slot);
  }

  create(packet: TotemPacket): void {
    if (
      !Number.isInteger(packet.slot) ||
      packet.slot < 0 ||
      packet.slot >= TOTEM_SLOTS
    )
      return;
    this.end(packet.slot, "replaced");
    const totem: Totem = {
      durationMs: packet.durationMs,
      guid: packet.guid,
      slot: packet.slot,
      spellId: packet.spellId,
      spellName: this.nameOf(packet.spellId),
      startedAt: this.now(),
    };
    this.slots.set(packet.slot, totem);
    this.emit({
      durationMs: totem.durationMs,
      guid: totem.guid,
      slot: totem.slot,
      spellId: totem.spellId,
      spellName: totem.spellName,
      type: "totem_created",
    });
  }

  requestDestroy(slot: number): void {
    this.destroying.add(slot);
  }

  disappear(guid: bigint): void {
    for (const totem of this.slots.values())
      if (totem.guid === guid) {
        this.end(
          totem.slot,
          this.destroying.has(totem.slot) ? "destroyed" : "gone",
        );
        return;
      }
  }

  expire(slot: number, guid: bigint): void {
    if (this.slots.get(slot)?.guid === guid) this.end(slot, "expired");
  }

  clear(): void {
    this.slots.clear();
    this.destroying.clear();
  }

  private end(slot: number, reason: TotemGoneReason): void {
    const totem = this.slots.get(slot);
    if (!totem) return;
    this.slots.delete(slot);
    this.destroying.delete(slot);
    this.emit({
      guid: totem.guid,
      reason,
      slot,
      spellId: totem.spellId,
      spellName: totem.spellName,
      type: "totem_gone",
    });
  }
}
