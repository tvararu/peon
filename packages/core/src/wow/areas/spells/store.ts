import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  type MirrorImage,
  type MirrorImageEvent,
  MirrorImages,
  type MirrorRequest,
} from "#wow/areas/spells/mirror";
import type {
  ChannelStart,
  ChannelUpdate,
  ConvertRune,
  MirrorImagePacket,
  ModifyCooldown,
  ProjectilePosition,
  SpellModifier,
  SpellVisual,
  TotemCreatedPacket,
} from "#wow/areas/spells/protocol";
import { type Rune, type RuneEvent, Runes } from "#wow/areas/spells/runes";
import type { SkillCatalog } from "#wow/areas/spells/skill-names";
import { STATIC_SKILL_CATALOG } from "#wow/areas/spells/skill-names";
import { readSkills, type Skill } from "#wow/areas/spells/skills";
import { type Totem, type TotemEvent, Totems } from "#wow/areas/spells/totems";
import type { UnitCast, UnitCastEvent } from "#wow/areas/spells/unit-casts";
import { UnitCasts } from "#wow/areas/spells/unit-casts";
import type { CombatChannel } from "#wow/combat-casts";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { SpellFailure, SpellGo, SpellStart } from "#wow/protocol/spell";
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
  unitCasts: readonly UnitCast[];
  totems: readonly (Readonly<Totem> | undefined)[];
  skills: readonly Skill[];
  runes: readonly Rune[] | undefined;
  mirrorImages: readonly MirrorImage[];
};
export type SpellsEvent =
  | {
      type: "channel_start";
      spellId: number;
      durationMs: number | undefined;
      target: bigint | undefined;
    }
  | { type: "channel_end"; spellId: number; reason: ChannelEndReason }
  | { type: "spell_visual"; guid: bigint; kit: number; impact: boolean }
  | {
      type: "skill_changed";
      id: number;
      name: string;
      from: number | undefined;
      to: number;
      max: number;
    }
  | { type: "skill_removed"; id: number; name: string }
  | RuneEvent
  | MirrorImageEvent
  | ({ type: "projectile_moved" } & ProjectilePosition)
  | TotemEvent
  | UnitCastEvent;

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
  private readonly units: UnitCasts;
  private readonly runes = new Runes();
  private readonly totems: Totems;
  private readonly mirrors: MirrorImages;
  private failed = false;
  private fieldSeen = false;
  private fieldTarget: bigint | undefined;
  private barToggles: number | undefined;
  private inactiveRanks: readonly number[] = [];
  private catalog: SkillCatalog = STATIC_SKILL_CATALOG;
  private skillBaseline: readonly Skill[] | undefined;
  private readonly modifiers: Record<
    SpellModifierKind,
    Map<number, Map<number, number>>
  > = { flat: new Map(), pct: new Map() };

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
    this.units = new UnitCasts(deps, core.combat, (event) =>
      this.events.emit(event),
    );
    this.totems = new Totems(
      deps.now,
      (spellId) => core.combat.definition(spellId)?.name,
      (event) => this.events.emit(event),
    );
    this.mirrors = new MirrorImages(
      (guid) => {
        const type = deps.getEntity(guid)?.objectType;
        return type === ObjectType.UNIT || type === ObjectType.PLAYER;
      },
      (event) => this.events.emit(event),
    );
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
      skills: this.skills(),
      runes: this.runeSnapshot(),
      totems: this.totems.snapshot(),
      unitCasts: this.units.snapshot(),
      mirrorImages: this.mirrors.snapshot(),
    };
  }

  onEvent(cb: (event: SpellsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  channelStart(packet: ChannelStart): void {
    if (packet.caster !== this.deps.selfGuid()) {
      if (packet.durationMs === undefined) return;
      this.units.start({
        durationMs: packet.durationMs,
        guid: packet.caster,
        kind: "channel",
        spellId: packet.spellId,
        startedAt: this.deps.now(),
        target: undefined,
      });
      return;
    }
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
    if (packet.caster !== this.deps.selfGuid()) {
      if (packet.remainingMs > 0) return;
      const entry = this.units.castOf(packet.caster);
      if (entry?.kind !== "channel") return;
      this.units.settle(packet.caster, entry.spellId, "finished");
      return;
    }
    if (packet.remainingMs > 0)
      this.core.combat.casts.updateChannel(packet.remainingMs);
    else this.end();
  }

  spellStart(packet: SpellStart): void {
    if (packet.caster === this.deps.selfGuid()) return;
    if (packet.timer <= 0) return;
    this.units.start({
      durationMs: packet.timer,
      guid: packet.caster,
      kind: "cast",
      spellId: packet.spellId,
      startedAt: this.deps.now(),
      target: packet.targets.objectGuid,
    });
  }

  spellGo(packet: SpellGo): void {
    if (packet.caster !== this.deps.selfGuid()) {
      this.units.end(packet.caster, packet.spellId, "succeeded");
      return;
    }
    if (packet.runes)
      this.runes.read(
        this.deps.getEntity(this.deps.selfGuid())?.rawFields,
        packet.runes,
      );
  }

  convertRune(packet: ConvertRune): void {
    const event = this.runes.convert(
      this.deps.getEntity(this.deps.selfGuid())?.rawFields,
      packet.index,
      packet.type,
    );
    if (event) this.events.emit(event);
  }

  spellFailure(packet: SpellFailure): void {
    if (packet.caster !== this.deps.selfGuid()) {
      this.units.end(packet.caster, packet.spellId, "interrupted");
      return;
    }
    if (this.core.combat.casts.channel?.spellId === packet.spellId)
      this.failed = true;
  }

  dropUnitCast(guid: bigint): void {
    this.units.drop(guid);
    this.mirrors.drop(guid);
  }

  requestMirrorImage(guid: bigint): MirrorRequest {
    return this.mirrors.request(guid);
  }

  projectileMoved(packet: ProjectilePosition): void {
    this.events.emit({ type: "projectile_moved", ...packet });
  }

  mirrorImage(packet: MirrorImagePacket): void {
    this.mirrors.accept(packet);
  }

  totemCreated(packet: TotemCreatedPacket): void {
    this.totems.create(packet);
  }

  totemDisappeared(guid: bigint): void {
    this.totems.disappear(guid);
  }

  totemExpired(slot: number, guid: bigint): void {
    this.totems.expire(slot, guid);
  }

  totemAt(slot: number): Readonly<Totem> | undefined {
    return this.totems.at(slot);
  }

  requestTotemDestroy(slot: number): void {
    this.totems.requestDestroy(slot);
  }

  castOf(guid: bigint): UnitCast | undefined {
    return this.units.castOf(guid);
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

  spellVisual(packet: SpellVisual, impact: boolean): void {
    this.events.emit({
      type: "spell_visual",
      guid: packet.guid,
      kit: packet.kit,
      impact,
    });
  }

  setSkillCatalog(catalog: SkillCatalog): void {
    this.catalog = catalog;
  }

  skillKnown(id: number): boolean {
    return this.skills().some((skill) => skill.id === id);
  }

  isPrimaryProfession(id: number): boolean {
    return this.catalog.isPrimary(id);
  }

  readSkills(): void {
    const current = this.skills();
    this.emitSkillChanges(current);
    this.skillBaseline = current;
  }

  private skills(): Skill[] {
    return readSkills(
      this.deps.getEntity(this.deps.selfGuid())?.rawFields,
      this.catalog,
    );
  }

  private runeSnapshot(): readonly Rune[] | undefined {
    return this.runes.read(
      this.deps.getEntity(this.deps.selfGuid())?.rawFields,
    );
  }

  private emitSkillChanges(current: readonly Skill[]): void {
    if (!this.skillBaseline) return;
    const before = new Map(
      this.skillBaseline.map((skill) => [skill.id, skill]),
    );
    const after = new Map(current.map((skill) => [skill.id, skill]));
    for (const skill of current) {
      const prev = before.get(skill.id);
      if (!prev) {
        this.events.emit({
          from: undefined,
          id: skill.id,
          max: skill.max,
          name: skill.name,
          to: skill.value,
          type: "skill_changed",
        });
      } else if (prev.value !== skill.value || prev.max !== skill.max) {
        this.events.emit({
          from: prev.value,
          id: skill.id,
          max: skill.max,
          name: skill.name,
          to: skill.value,
          type: "skill_changed",
        });
      }
    }
    for (const skill of this.skillBaseline)
      if (!after.has(skill.id))
        this.events.emit({
          id: skill.id,
          name: skill.name,
          type: "skill_removed",
        });
  }

  selfFields(fields: ReadonlyMap<number, number>): void {
    const bytes = fields.get(FIELD_BYTES);
    if (bytes !== undefined) this.barToggles = (bytes >>> 16) & 0xff;
    this.readSkills();
    this.runes.read(this.deps.getEntity(this.deps.selfGuid())?.rawFields);
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
    this.units.dispose();
    this.totems.clear();
    this.runes.clear();
    this.mirrors.clear();
    this.events.clear();
  }
}
