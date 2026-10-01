import { DISPLAY_LAYOUT } from "#wow/areas/objects/display-catalog";
import { LOCK_LAYOUT } from "#wow/areas/objects/lock-catalog";
import { TRIGGER_LAYOUT } from "#wow/areas/objects/trigger-catalog";
import { AREA_TABLE_LAYOUT } from "#wow/areas/raid/zone-names";
import { FACTION_LAYOUT } from "#wow/areas/reputation/catalog";
import { SKILL_LINE_LAYOUT } from "#wow/areas/spells/skill-names";
import { TALENT_LAYOUTS } from "#wow/areas/talents/catalog";
import {
  TRANSPORT_ANIMATION_LAYOUT,
  TRANSPORT_ROTATION_LAYOUT,
} from "#wow/areas/transports/lift";
import { TAXI_PATH_NODE_LAYOUT } from "#wow/areas/transports/path";
import { TAXI_NODES_LAYOUT, TAXI_PATH_LAYOUT } from "#wow/areas/travel/catalog";
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
  DISPLAY_LAYOUT.file,
  LOCK_LAYOUT.file,
  TRIGGER_LAYOUT.file,
  TAXI_NODES_LAYOUT.file,
  TAXI_PATH_LAYOUT.file,
  AREA_TABLE_LAYOUT.file,
  SKILL_LINE_LAYOUT.file,
  TALENT_LAYOUTS.talent.file,
  TALENT_LAYOUTS.tab.file,
  TALENT_LAYOUTS.glyph.file,
  TALENT_LAYOUTS.slot.file,
  TAXI_PATH_NODE_LAYOUT.file,
  TRANSPORT_ANIMATION_LAYOUT.file,
  TRANSPORT_ROTATION_LAYOUT.file,
];
