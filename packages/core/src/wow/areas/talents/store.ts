import { Emitter, type Unsubscribe } from "#lib/emitter";
import {
  GLYPH_SLOTS,
  type TalentFields,
  talentFields,
} from "#wow/areas/talents/fields";
import type {
  PetTalentsInfo,
  PlayerTalentsInfo,
  TalentsInfo,
} from "#wow/areas/talents/protocol";
import type { Entity } from "#wow/entity-store";
import type { TalentRank, TalentSpec } from "#wow/protocol/talent-spec";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type GlyphSlot = {
  index: number;
  typeId: number | undefined;
  unlocked: boolean | undefined;
  glyphId: number | undefined;
};
export type TalentsState = {
  player: PlayerTalentsInfo | undefined;
  pet: PetTalentsInfo | undefined;
  fields: TalentFields;
  slots: readonly GlyphSlot[];
};
export type TalentChange = { talentId: number; from: number; to: number };
export type GlyphChange = { slot: number; from: number; to: number };

export type TalentsEvent =
  | {
      type: "refused";
      outcome: "refused";
      entries: readonly TalentRank[];
    }
  | {
      type: "info";
      talents: readonly TalentChange[];
      glyphs: readonly GlyphChange[];
      pointsBefore: number;
      pointsAfter: number;
      specBefore: number;
      specAfter: number;
    }
  | { type: "points"; before: number; after: number }
  | {
      type: "pet_info";
      freePoints: number;
      talents: PetTalentsInfo["talents"];
    };

function held(spec: TalentSpec | undefined): Map<number, number> {
  return new Map(
    (spec?.talents ?? []).map((talent) => [talent.talentId, talent.rank + 1]),
  );
}

function talentChanges(
  before: TalentSpec | undefined,
  after: TalentSpec | undefined,
): TalentChange[] {
  const from = held(before);
  const to = held(after);
  const ids = [...new Set([...from.keys(), ...to.keys()])].sort(
    (a, b) => a - b,
  );
  return ids
    .map((talentId) => ({
      talentId,
      from: from.get(talentId) ?? 0,
      to: to.get(talentId) ?? 0,
    }))
    .filter((change) => change.from !== change.to);
}

function glyphChanges(
  before: TalentSpec | undefined,
  after: TalentSpec | undefined,
): GlyphChange[] {
  const changes: GlyphChange[] = [];
  for (let slot = 0; slot < GLYPH_SLOTS; slot++) {
    const from = before?.glyphs[slot] ?? 0;
    const to = after?.glyphs[slot] ?? 0;
    if (from !== to) changes.push({ slot, from, to });
  }
  return changes;
}

function activeSpec(info: PlayerTalentsInfo | undefined, index: number) {
  return info?.specs[index];
}

function unlockedOf(mask: number | undefined, index: number) {
  return mask === undefined ? undefined : (mask & (1 << index)) !== 0;
}

export class TalentsStore {
  private readonly events = new Emitter<[TalentsEvent]>();
  private readonly deps: SessionDeps;
  private player: PlayerTalentsInfo | undefined;
  private pet: PetTalentsInfo | undefined;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.deps = deps;
  }

  snapshot(): TalentsState {
    const fields = talentFields(this.deps);
    const spec = this.player
      ? activeSpec(this.player, this.player.activeSpec)
      : undefined;
    const slots = Array.from({ length: GLYPH_SLOTS }, (_, index) => ({
      index,
      typeId: fields.slotTypes[index],
      unlocked: unlockedOf(fields.enabledMask, index),
      glyphId: spec?.glyphs[index],
    }));
    return {
      player: this.player && structuredClone(this.player),
      pet: this.pet && structuredClone(this.pet),
      fields,
      slots,
    };
  }

  onEvent(cb: (event: TalentsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  info(packet: TalentsInfo): void {
    if (packet.kind === "pet") {
      this.receivePet(packet);
      return;
    }
    const before = this.player;
    this.player = packet;
    const index = packet.activeSpec;
    const pointsBefore = before?.freePoints ?? 0;
    this.events.emit({
      type: "info",
      talents: talentChanges(
        activeSpec(before, index),
        activeSpec(packet, index),
      ),
      glyphs: glyphChanges(
        activeSpec(before, index),
        activeSpec(packet, index),
      ),
      pointsBefore,
      pointsAfter: packet.freePoints,
      specBefore: before?.activeSpec ?? 0,
      specAfter: index,
    });
    if (packet.freePoints > pointsBefore)
      this.events.emit({
        type: "points",
        before: pointsBefore,
        after: packet.freePoints,
      });
  }

  private receivePet(packet: PetTalentsInfo): void {
    this.pet = packet;
    this.events.emit({
      type: "pet_info",
      freePoints: packet.freePoints,
      talents: packet.talents.map((talent) => ({ ...talent })),
    });
  }

  entityOf(guid: bigint): Entity | undefined {
    return this.deps.getEntity(guid);
  }

  noteRefused(entries: readonly TalentRank[]): void {
    this.events.emit({
      entries: entries.map((entry) => ({ ...entry })),
      outcome: "refused",
      type: "refused",
    });
  }

  dispose(): void {
    this.events.clear();
    this.player = undefined;
    this.pet = undefined;
  }
}
