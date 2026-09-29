import { LOCK_LAYOUT } from "#wow/areas/objects/lock-catalog";
import { TRIGGER_LAYOUT } from "#wow/areas/objects/trigger-catalog";
import { FACTION_LAYOUT } from "#wow/areas/reputation/catalog";
import { FACTION_TEMPLATE_LAYOUT } from "#wow/faction-template";
import { SPELL_LAYOUT } from "#wow/spell-catalog";

export const REQUIRED_DBC_FILES: readonly string[] = [
  SPELL_LAYOUT.spell.file,
  SPELL_LAYOUT.range.file,
  SPELL_LAYOUT.cast.file,
  SPELL_LAYOUT.duration.file,
  SPELL_LAYOUT.radius.file,
  FACTION_TEMPLATE_LAYOUT.file,
  FACTION_LAYOUT.file,
  LOCK_LAYOUT.file,
  TRIGGER_LAYOUT.file,
];
