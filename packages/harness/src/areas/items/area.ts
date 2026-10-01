import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ItemsEvent = AreaEventOf<"items">;
type ItemsAreaState = AreaState<"items">;
type Moved = Extract<ItemsEvent, { type: "moved" }>;
type Received = Extract<ItemsEvent, { type: "item_received" }>;

const MOVED_ROW: Record<string, { name: string; verb: string }> = {
  ammo: { name: "ammo", verb: "Loaded" },
  equip: { name: "equipped", verb: "Equipped" },
  equip_slot: { name: "equipped", verb: "Equipped" },
  split: { name: "split", verb: "Split" },
  swap: { name: "moved", verb: "Moved" },
  unequip: { name: "unequipped", verb: "Took off" },
  wrap: { name: "wrapped", verb: "Wrapped" },
};

function movedRow(event: Moved, rc: RuleInput): AreaDraft {
  const row = MOVED_ROW[event.kind] ?? { name: "moved", verb: "Moved" };
  const label =
    event.entry === undefined
      ? guidText(event.itemGuid)
      : (rc.lookup.itemName(event.entry) ?? `item ${event.entry}`);
  return {
    class: "log",
    data: {
      entry: event.entry,
      item: guidText(event.itemGuid),
      kind: event.kind,
    },
    guid: guidText(event.itemGuid),
    name: row.name,
    ref: guidText(event.itemGuid),
    text: `${row.verb} ${label}.`,
  };
}

function receivedRow(event: Received, rc: RuleInput): AreaDraft[] {
  if (event.wornItemLevel === undefined) return [];
  if (event.itemLevel <= event.wornItemLevel) return [];
  const name = rc.lookup.itemName(event.entry) ?? `item ${event.entry}`;
  return [
    {
      class: "wake",
      data: {
        entry: event.entry,
        itemLevel: event.itemLevel,
        wornItemLevel: event.wornItemLevel,
      },
      name: "upgrade",
      text: `Better item: ${name} (item level ${event.itemLevel}, worn ${event.wornItemLevel}).`,
    },
  ];
}

const WEAPON_PROFICIENCY: Record<number, string> = {
  0: "one-handed axes",
  1: "two-handed axes",
  2: "bows",
  3: "guns",
  4: "one-handed maces",
  5: "two-handed maces",
  6: "polearms",
  7: "one-handed swords",
  8: "two-handed swords",
  10: "staves",
  13: "fist weapons",
  15: "daggers",
  16: "thrown weapons",
  18: "crossbows",
  19: "wands",
  20: "fishing poles",
};
const ARMOR_PROFICIENCY: Record<number, string> = {
  1: "cloth",
  2: "leather",
  3: "mail",
  4: "plate",
  6: "shields",
  7: "librams",
  8: "idols",
  9: "totems",
  10: "sigils",
};

function proficiencyRow(
  kind: "weapon" | "armor",
  mask: number,
): AreaDraft | undefined {
  const table = kind === "weapon" ? WEAPON_PROFICIENCY : ARMOR_PROFICIENCY;
  const names: string[] = [];
  let rest = mask;
  let bit = 0;
  while (rest !== 0) {
    if (rest % 2 === 1) names.push(table[bit] ?? `subclass ${bit}`);
    rest = Math.floor(rest / 2);
    bit += 1;
  }
  if (names.length === 0) return undefined;
  return {
    class: "log",
    data: { kind, mask, names },
    name: "proficiency",
    text: `You can now use ${names.join(", ")}.`,
  };
}

const WAKE_UNDER_SECONDS = 60;

function itemLabel(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "An item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function span(seconds: number): string {
  if (seconds >= 3600) {
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${Math.floor(seconds / 3600)} h${minutes > 0 ? ` ${minutes} min` : ""}`;
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`;
  return `${seconds} s`;
}

function timerRows(event: ItemsEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "item_cooldown")
    return [
      {
        class: "log",
        data: { entry: event.entry, spell: event.spell },
        guid: guidText(event.itemGuid),
        name: "cooldown",
        ref: guidText(event.itemGuid),
        text: `${itemLabel(event.entry, rc)} is on cooldown.`,
      },
    ];
  if (event.type === "item_timer" || event.type === "item_enchant_timer") {
    const enchant = event.type === "item_enchant_timer";
    const label = itemLabel(event.entry, rc);
    const left = span(event.seconds);
    return [
      {
        class: event.seconds < WAKE_UNDER_SECONDS ? "wake" : "passive",
        data: {
          entry: event.entry,
          seconds: event.seconds,
          ...(enchant && { enchantSlot: event.slot }),
        },
        guid: guidText(event.itemGuid),
        name: "expiring",
        ref: guidText(event.itemGuid),
        text: enchant
          ? `The temporary enchant on ${label} ends in ${left}.`
          : `${label} expires in ${left}.`,
      },
    ];
  }
  if (event.type === "durability_loss_death")
    return [
      {
        class: "wake",
        data: {},
        name: "durability_loss",
        text: "Dying damaged your equipment; repair it at a vendor.",
      },
    ];
  if (event.type === "proficiency_changed" && event.names.length > 0)
    return [
      {
        class: "log",
        data: { kind: event.kind, mask: event.mask, names: event.names },
        name: "proficiency",
        text: `You can now use ${event.names.join(", ")}.`,
      },
    ];
  return [];
}

function remaining(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function attachRows(
  state: ItemsAreaState,
  rc: RuleInput,
): readonly AreaDraft[] {
  const rows: AreaDraft[] = [];
  const { proficiency } = state.timers;
  for (const kind of ["weapon", "armor"] as const) {
    const mask = proficiency[kind];
    if (mask === "unknown" || mask === 0) continue;
    const row = proficiencyRow(kind, mask);
    if (row) rows.push(row);
  }
  for (const timer of state.timers.timers) {
    const seconds = remaining(timer.expiresAt, rc.now);
    if (timer.expiresAt < rc.now) continue;
    rows.push(
      ...timerRows(
        {
          entry: undefined,
          expiresAt: timer.expiresAt,
          itemGuid: timer.itemGuid,
          seconds,
          type: "item_timer",
        } as ItemsEvent,
        rc,
      ),
    );
  }
  for (const enchant of state.timers.enchants) {
    const seconds = remaining(enchant.expiresAt, rc.now);
    if (enchant.expiresAt < rc.now) continue;
    rows.push(
      ...timerRows(
        {
          entry: undefined,
          expiresAt: enchant.expiresAt,
          itemGuid: enchant.itemGuid,
          seconds,
          slot: enchant.slot,
          type: "item_enchant_timer",
        } as ItemsEvent,
        rc,
      ),
    );
  }
  return rows;
}

function socketRows(
  event: Extract<
    ItemsEvent,
    | { type: "sockets_updated" }
    | { type: "socket_refused" }
    | { type: "socket_unanswered" }
    | { type: "enchantment_log" }
  >,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "sockets_updated")
    return [
      {
        class: "log",
        data: {
          bonus: event.bonus,
          entry: event.entry,
          sockets: [...event.sockets],
        },
        guid: guidText(event.itemGuid),
        name: "socketed",
        ref: guidText(event.itemGuid),
        text: `Socketed ${itemLabel(event.entry, rc)}.`,
      },
    ];
  if (event.type === "socket_refused")
    return [
      {
        class: "wake",
        data: { entry: event.entry, reason: event.reason },
        guid: guidText(event.itemGuid),
        name: "refused",
        ref: guidText(event.itemGuid),
        text: `Socket refused: ${event.reason}.`,
      },
    ];
  if (event.type === "socket_unanswered")
    return [
      {
        class: "wake",
        data: { entry: event.entry },
        guid: guidText(event.itemGuid),
        name: "unanswered",
        ref: guidText(event.itemGuid),
        text: "The socket went unanswered.",
      },
    ];
  if (event.type === "enchantment_log" && event.own && event.enchantId > 0)
    return [
      {
        class: "log",
        data: { enchantId: event.enchantId, entry: event.entry },
        guid: guidText(event.target),
        name: "enchanted",
        ref: guidText(event.target),
        text: `Enchanted ${itemLabel(event.entry, rc)}.`,
      },
    ];
  return [];
}

function setRows(
  event: Extract<ItemsEvent, { type: "set_saved" } | { type: "set_used" }>,
): readonly AreaDraft[] {
  if (event.type === "set_saved")
    return event.status === "unanswered"
      ? [
          {
            class: "wake",
            data: { index: event.index, name: event.name },
            name: "unanswered",
            text: `The save of equipment set ${event.name} went unanswered.`,
          },
        ]
      : [
          {
            class: "log",
            data: {
              index: event.index,
              kind: event.kind,
              name: event.name,
              status: event.status,
            },
            name: "set_saved",
            text: `Saved equipment set ${event.name}.`,
          },
        ];
  return event.status === "ok"
    ? [
        {
          class: "log",
          data: {
            failures: [...event.failures],
            index: event.index,
            status: event.status,
          },
          name: "set_used",
          text: `Wore equipment set ${event.index}.`,
        },
      ]
    : [
        {
          class: "wake",
          data: {
            failures: [...event.failures],
            index: event.index,
            reason: event.reason,
            status: event.status,
          },
          name: "set_used",
          text:
            event.status === "bags_full"
              ? `Equipment set ${event.index} did not fit in the bags.`
              : `Wearing equipment set ${event.index} went unanswered.`,
        },
      ];
}

function eventRow(event: ItemsEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "moved") return [movedRow(event, rc)];
  if (event.type === "move_refused")
    return [
      {
        class: "wake",
        data: { entry: event.entry, reason: event.reason },
        guid: guidText(event.itemGuid),
        name: "refused",
        ref: guidText(event.itemGuid),
        text: `Move refused: ${event.reason}.`,
      },
    ];
  if (event.type === "move_unanswered")
    return [
      {
        class: "wake",
        data: { entry: event.entry, kind: event.kind },
        guid: guidText(event.itemGuid),
        name: "unanswered",
        ref: guidText(event.itemGuid),
        text: "The move went unanswered.",
      },
    ];
  if (event.type === "item_received") return receivedRow(event, rc);
  if (
    event.type === "sockets_updated" ||
    event.type === "socket_refused" ||
    event.type === "socket_unanswered" ||
    event.type === "enchantment_log"
  )
    return socketRows(event, rc);
  if (event.type === "set_saved" || event.type === "set_used")
    return setRows(event);
  if (event.type === "read_ok")
    return [
      {
        class: "log",
        data: { entry: event.entry },
        guid: guidText(event.itemGuid),
        name: "read",
        ref: guidText(event.itemGuid),
        text: `Read ${guidText(event.itemGuid)}.`,
      },
    ];
  if (event.type === "item_text")
    return [
      {
        class: "log",
        data: { text: event.text },
        guid: guidText(event.guid),
        name: "read",
        ref: guidText(event.guid),
        text: event.text,
      },
    ];
  return timerRows(event, rc);
}

export const itemsHarness = defineHarnessArea({
  area: "items",
  glyph: "bag",
  rules: () => ({
    attach: (state, rc) => attachRows(state, rc),
    event: (event, rc) => eventRow(event, rc),
  }),
  worldActs: [
    "equip",
    "equipTo",
    "move",
    "open",
    "read",
    "setAmmo",
    "socket",
    "split",
    "unequip",
  ],
});
