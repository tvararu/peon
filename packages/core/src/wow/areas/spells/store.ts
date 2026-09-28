import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ChannelStart,
  ChannelUpdate,
  ModifyCooldown,
  SpellModifier,
} from "#wow/areas/spells/protocol";
import type { CombatChannel } from "#wow/combat-casts";
import type { SpellFailure } from "#wow/protocol/spell";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type ChannelEndReason = "finished" | "interrupted" | "cancelled";
export type SpellsChannel = Readonly<CombatChannel>;
export type SpellModifierKind = "flat" | "pct";
export type SpellModifierTotals = Readonly<
  Record<number, Readonly<Record<number, number>>>
>;
export type SpellsState = {
  channel: SpellsChannel | undefined;
  barToggles: number | undefined;
  inactiveRanks: readonly number[];
  modifiers: Readonly<Record<SpellModifierKind, SpellModifierTotals>>;
};
export type SpellsEvent =
  | {
      type: "channel_start";
      spellId: number;
      durationMs: number | undefined;
      target: bigint | undefined;
    }
  | { type: "channel_end"; spellId: number; reason: ChannelEndReason };

const END_TOLERANCE_MS = 400;
const CHANNEL_SPELL = UNIT_FIELDS.CHANNEL_SPELL.offset;
const CHANNEL_OBJECT = UNIT_FIELDS.CHANNEL_OBJECT.offset;
const FIELD_BYTES = PLAYER_FIELDS.FEATURES.offset;

function channelObject(fields: ReadonlyMap<number, number>): bigint {
  const low = fields.get(CHANNEL_OBJECT) ?? 0;
  const high = fields.get(CHANNEL_OBJECT + 1) ?? 0;
  return (BigInt(high) << 32n) | BigInt(low);
}

function totals(
  ops: ReadonlyMap<number, ReadonlyMap<number, number>>,
): SpellModifierTotals {
  return Object.fromEntries(
    [...ops].map(([op, bits]) => [op, Object.fromEntries(bits)]),
  );
}

export class SpellsStore {
  private readonly events = new Emitter<[SpellsEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private failed = false;
  private fieldSeen = false;
  private fieldTarget: bigint | undefined;
  private barToggles: number | undefined;
  private inactiveRanks: readonly number[] = [];
  private readonly modifiers: Record<
    SpellModifierKind,
    Map<number, Map<number, number>>
  > = { flat: new Map(), pct: new Map() };

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): SpellsState {
    const channel = this.core.combat.casts.channel;
    return {
      barToggles: this.barToggles,
      channel: channel && {
        ...channel,
        target: this.fieldTarget ?? channel.target,
      },
      inactiveRanks: [...this.inactiveRanks],
      modifiers: {
        flat: totals(this.modifiers.flat),
        pct: totals(this.modifiers.pct),
      },
    };
  }

  onEvent(cb: (event: SpellsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  channelStart(packet: ChannelStart): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    this.failed = false;
    this.fieldSeen = false;
    this.fieldTarget = undefined;
    const channel = this.core.combat.casts.beginChannel({
      spellId: packet.spellId,
      target: undefined,
      durationMs: packet.durationMs,
    });
    this.events.emit({
      type: "channel_start",
      spellId: channel.spellId,
      durationMs: channel.durationMs,
      target: channel.target,
    });
  }

  channelUpdate(packet: ChannelUpdate): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    if (packet.remainingMs > 0)
      this.core.combat.casts.updateChannel(packet.remainingMs);
    else this.end();
  }

  spellFailure(packet: SpellFailure): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    if (this.core.combat.casts.channel?.spellId === packet.spellId)
      this.failed = true;
  }

  unlearnSpells(spellIds: readonly number[]): void {
    this.inactiveRanks = spellIds;
  }

  spellModifier(kind: SpellModifierKind, packet: SpellModifier): void {
    const ops = this.modifiers[kind];
    const bits = ops.get(packet.op) ?? new Map<number, number>();
    if (packet.value === 0) bits.delete(packet.bit);
    else bits.set(packet.bit, packet.value);
    if (bits.size === 0) ops.delete(packet.op);
    else ops.set(packet.op, bits);
  }

  modifyCooldown(packet: ModifyCooldown): void {
    if (packet.guid !== this.deps.selfGuid()) return;
    this.core.combat.casts.shiftCooldown(packet.spellId, packet.deltaMs);
  }

  selfFields(fields: ReadonlyMap<number, number>): void {
    const bytes = fields.get(FIELD_BYTES);
    if (bytes !== undefined) this.barToggles = (bytes >>> 16) & 0xff;
    const channel = this.core.combat.casts.channel;
    const spellId = fields.get(CHANNEL_SPELL);
    if (!channel || spellId === undefined) return;
    if (spellId === channel.spellId) {
      this.fieldSeen = true;
      const target = channelObject(fields);
      if (target !== 0n) this.fieldTarget = target;
    } else if (spellId === 0 && this.fieldSeen) this.end();
  }

  private reasonOf(channel: CombatChannel): ChannelEndReason {
    if (channel.cancelRequested) return "cancelled";
    if (this.failed || channel.endsAt === undefined) return "interrupted";
    return this.deps.now() >= channel.endsAt - END_TOLERANCE_MS
      ? "finished"
      : "interrupted";
  }

  private end(): void {
    const channel = this.core.combat.casts.endChannel();
    if (!channel) return;
    this.events.emit({
      type: "channel_end",
      spellId: channel.spellId,
      reason: this.reasonOf(channel),
    });
  }

  dispose(): void {
    this.events.clear();
  }
}
