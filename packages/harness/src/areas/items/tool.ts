import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { NamedInventoryState } from "@peon/core";
import { runBankDeposit } from "#harness/areas/items/tool-bank";
import { lootText, takeOffered } from "#harness/areas/items/tool-loot";
import { runAmmo, runRead } from "#harness/areas/items/tool-read";
import {
  AT_REF,
  atBag,
  BACKPACK,
  BAGS,
  bankDestination,
  destination,
  equipSlot,
  labelOf,
  named,
  type Occupied,
  slotsOf,
} from "#harness/areas/items/tool-resolve";
import { afterOf, moveRefusal } from "#harness/areas/items/tool-shared";
import { runSocket } from "#harness/areas/items/tool-socket";
import type { LootLine } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { itemIdText } from "#harness/ops/item-names";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const gearParams = Type.Object({
  count: Type.Optional(
    Type.Integer({
      description: "For split: how many to move. Default 1.",
      minimum: 1,
    }),
  ),
  do: StringEnum(
    ["equip", "unequip", "move", "split", "open", "read", "ammo", "socket"],
    {
      description:
        "equip: wear an item. unequip: take worn gear off. move: change bag or slot. split: divide a stack. open: open a container. read: read a readable item. ammo: load arrows or bullets for a ranged weapon. socket: put gems into a socketed item.",
    },
  ),
  gems: Type.Optional(
    Type.String({
      description:
        'For socket: comma-separated gem names as the bags journal shows them, e.g. "Bold Bloodstone, Bright Bloodstone".',
    }),
  ),
  item: Type.String({
    description:
      'Which item: its name as the bags journal shows it, "item <id>", or "bag B slot S".',
  }),
  slot: Type.Optional(
    Type.String({
      description:
        "For equip: head, neck, shoulders, shirt, chest, waist, legs, feet, wrists, hands, finger1, finger2, trinket1, trinket2, back, main_hand, off_hand, ranged, tabard, or a bag slot 19-22.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        'For move, split and unequip: "bags", "backpack", "bag 1-4", "bag 19-22", or "bag B slot S". For move: "bank" deposits through the open bank. Default: the first free bag slot.',
    }),
  ),
});

export type GearArgs = Static<typeof gearParams>;
export type GearDo = GearArgs["do"];

export type GearAfter = {
  do: GearDo;
  item: string;
  entry: number | undefined;
  from: { bag: number; slot: number };
  to: { bag: number; slot: number } | undefined;
  worn: string | undefined;
  taken: LootLine[];
  copper: number;
  text: string | undefined;
};

export type GearCtx = ToolCtx<GearAfter>;
export type GearHandle = GearCtx["handle"];

const EQUIP_NAMES: Record<number, string> = {
  0: "head",
  1: "neck",
  2: "shoulders",
  3: "shirt",
  4: "chest",
  5: "waist",
  6: "legs",
  7: "feet",
  8: "wrists",
  9: "hands",
  10: "finger1",
  11: "finger2",
  12: "trinket1",
  13: "trinket2",
  14: "back",
  15: "main hand",
  16: "off hand",
  17: "ranged",
  18: "tabard",
  19: "bag 19",
  20: "bag 20",
  21: "bag 21",
  22: "bag 22",
};

function emptyGear(): GearAfter {
  return {
    copper: 0,
    do: "equip",
    entry: undefined,
    from: { bag: BACKPACK, slot: 23 },
    item: "",
    taken: [],
    text: undefined,
    to: undefined,
    worn: undefined,
  };
}

function wornName(
  state: NamedInventoryState,
  slotNumber: number,
): string | undefined {
  const worn_ = state.slots.find(
    (slot_): slot_ is Occupied =>
      slot_.status === "occupied" &&
      slot_.region === "equipment" &&
      slot_.slot === slotNumber,
  );
  if (!worn_) return undefined;
  return worn_.item.name ?? itemIdText(worn_.item.entry ?? 0);
}

function slotName(position_: { bag: number; slot: number }): string {
  if (position_.bag !== BACKPACK)
    return `bag ${position_.bag} slot ${position_.slot}`;
  return EQUIP_NAMES[position_.slot] ?? `bag 255 slot ${position_.slot}`;
}

type EquipRender = {
  guid: bigint | undefined;
  label: string;
  to: { bag: number; slot: number } | undefined;
  worn: string | undefined;
  movedTo: { bag: number; slot: number } | undefined;
  after: NamedInventoryState;
};

function equippedText(render: EquipRender): string {
  const held = slotsOf(render.after).find(
    (entry) =>
      entry.region === "equipment" &&
      (render.guid === undefined
        ? labelOf(entry) === render.label
        : entry.guid === render.guid),
  );
  let where = "worn";
  if (held) where = slotName({ bag: held.bag, slot: held.slot });
  else if (render.to) where = slotName(render.to);
  const displaced = render.movedTo ?? { bag: BACKPACK, slot: 0 };
  const old =
    render.movedTo !== undefined &&
    render.worn !== undefined &&
    (displaced.bag !== BACKPACK || displaced.slot > 22)
      ? ` Old: ${render.worn}, now in ${slotName(displaced)}.`
      : "";
  return `Wearing ${render.label} (${where}).${old}`;
}

async function runEquip(
  ctx: GearCtx,
  item: string,
  slot: string | undefined,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const before = handle.getInventoryState();
  const found = named(before, item, ["backpack", "bag_item"]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const target = equipSlot(slot);
  const outcome_ =
    target === -1
      ? await rt.mutex.run(() => handle.items.act.equip(from))
      : await rt.mutex.run(() =>
          handle.items.act.equipTo(found.held.guid, target),
        );
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  const after = handle.getInventoryState();
  const wornBefore =
    target === -1
      ? undefined
      : slotsOf(before).find(
          (entry) => entry.region === "equipment" && entry.slot === target,
        );
  const wornAfter =
    wornBefore === undefined
      ? undefined
      : slotsOf(after).find((entry) => entry.guid === wornBefore.guid);
  const movedTo = wornAfter
    ? { bag: wornAfter.bag, slot: wornAfter.slot }
    : undefined;
  const to = target === -1 ? undefined : { bag: BACKPACK, slot: target };
  return result("DONE", {
    after: afterOf(found, from, {
      do: "equip",
      item: found.label,
      to,
      worn: wornBefore ? wornName(before, target) : undefined,
    }),
    detail: equippedText({
      after,
      guid: found.held.guid,
      label: found.label,
      movedTo,
      to,
      worn: wornBefore ? wornName(before, target) : undefined,
    }),
  });
}

async function runUnequip(
  ctx: GearCtx,
  item: string,
  bag: string | undefined,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, ["equipment", "bag"]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const toBag = atBag(bag);
  const outcome_ = await rt.mutex.run(() =>
    handle.items.act.unequip(found.held.slot, toBag),
  );
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  const landed = handle.getInventoryState();
  const placed = slotsOf(landed).find((slot) => slot.guid === found.held.guid);
  const parsed = bag === undefined ? undefined : AT_REF.exec(bag.trim());
  const at =
    parsed?.[1] === undefined || parsed[2] === undefined
      ? undefined
      : { bag: Number(parsed[1]), slot: Number(parsed[2]) };
  if (
    at === undefined ||
    placed === undefined ||
    (placed.bag === at.bag && placed.slot === at.slot)
  ) {
    const after = handle.getInventoryState();
    const now = slotsOf(after).find((slot) => slot.guid === found.held.guid);
    const where = now ? `bag ${now.bag} slot ${now.slot}` : "in your bags";
    return result("DONE", {
      after: afterOf(found, from, {
        do: "unequip",
        item: found.label,
        to: now ? { bag: now.bag, slot: now.slot } : undefined,
      }),
      detail: `Took off ${found.label}, now ${where}.`,
    });
  }
  const settled = await rt.mutex.run(() =>
    handle.items.act.move(
      { bag: placed.bag, slot: placed.slot },
      { bag: at.bag, slot: at.slot },
    ),
  );
  if (settled.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, settled);
  const after = handle.getInventoryState();
  const now = slotsOf(after).find((slot) => slot.guid === found.held.guid);
  const where = now ? `bag ${now.bag} slot ${now.slot}` : "in your bags";
  return result("DONE", {
    after: afterOf(found, from, {
      do: "unequip",
      item: found.label,
      to: now ? { bag: now.bag, slot: now.slot } : undefined,
    }),
    detail: `Took off ${found.label}, now ${where}.`,
  });
}

async function runMove(
  ctx: GearCtx,
  item: string,
  to: string | undefined,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  if (bankDestination(to) !== undefined)
    return runBankDeposit(ctx, found, from);
  const toAt = destination(handle, to, from);
  const outcome_ = await rt.mutex.run(() => handle.items.act.move(from, toAt));
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  return result("DONE", {
    after: afterOf(found, from, {
      do: "move",
      item: found.label,
      to: toAt,
    }),
    detail: `Moved ${found.label} to bag ${toAt.bag} slot ${toAt.slot}.`,
  });
}

async function runSplit(
  ctx: GearCtx,
  item: string,
  to: string | undefined,
  count: number,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const toAt = destination(handle, to, from);
  const outcome_ = await rt.mutex.run(() =>
    handle.items.act.split(from, toAt, count),
  );
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  return result("DONE", {
    after: afterOf(found, from, {
      do: "split",
      item: found.label,
      to: toAt,
    }),
    detail: `Split ${count} of ${found.label} to bag ${toAt.bag} slot ${toAt.slot}.`,
  });
}

async function runOpen(
  ctx: GearCtx,
  item: string,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const loot = await rt.mutex.run(() => handle.items.act.open(from));
  const offered = loot.items.filter(
    (line) => line.slotType === 0 || line.slotType === 4,
  );
  const { copper, taken } = await takeOffered(ctx, loot);
  const live = handle.getRewardsState().loot;
  const left =
    live.phase === "open" || live.phase === "closing"
      ? offered.filter((line) =>
          live.items.some((rest) => rest.slot === line.slot),
        ).length
      : 0;
  const detail =
    left > 0
      ? `Opened ${found.label}: ${lootText(taken, copper) || "nothing"}; ${left} item(s) left behind.`
      : `Opened ${found.label}${taken.length + copper > 0 ? `: ${lootText(taken, copper)}` : " (empty)"}.`;
  if (left > 0)
    return result("PARTLY", {
      after: afterOf(found, from, {
        copper,
        do: "open",
        item: found.label,
        taken,
      }),
      detail,
      next: BAGS,
      reason: "bags_full",
    });
  return result("DONE", {
    after: afterOf(found, from, {
      copper,
      do: "open",
      item: found.label,
      taken,
    }),
    detail,
  });
}

function runGear(args: GearArgs, ctx: GearCtx): Promise<ToolResult<GearAfter>> {
  if (args.do === "equip") return runEquip(ctx, args.item, args.slot);
  if (args.do === "unequip") return runUnequip(ctx, args.item, args.to);
  if (args.do === "move") return runMove(ctx, args.item, args.to);
  if (args.do === "split")
    return runSplit(ctx, args.item, args.to, args.count ?? 1);
  if (args.do === "open") return runOpen(ctx, args.item);
  if (args.do === "ammo") return runAmmo(ctx, args.item);
  if (args.do === "socket") return runSocket(ctx, args.item, args.gems);
  return runRead(ctx, args.item);
}

function gearCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "bag",
    parts: [
      argText(args, "do") ?? "equip",
      argText(args, "item"),
      argText(args, "slot") ?? argText(args, "to"),
    ],
    theme,
    verb: "gear",
  });
}

function gearRows(after: GearAfter): string[] {
  const taken = after.taken.map((line) => `${line.name} x${line.count}`);
  if (after.copper > 0) taken.push(`${after.copper} copper`);
  const rows = [...taken];
  if (after.text) rows.push(after.text);
  if (after.worn) rows.push(`Old: ${after.worn}.`);
  return rows;
}

function gearBody({
  after,
  expanded,
}: {
  after: GearAfter;
  expanded: boolean;
}): string[] {
  return expanded ? gearRows(after) : [];
}

export const gearRenderers: ToolRenderers<"gear", GearAfter> = {
  renderCall: callRenderer(gearCall),
  renderResult: resultRenderer("gear", gearBody),
};

export const gearSpec: GameToolSpec<typeof gearParams, "gear", GearAfter> = {
  allowStopped: (args) => args.do === "read",
  fallback: emptyGear,
  kind: "action",
  minimalArgs: { do: "equip", item: "Gnarled Staff" },
  name: "gear",
  parameters: gearParams,
  renderers: gearRenderers,
  run: runGear,
  text: {
    description:
      "Wear gear, remove it, move it between bags, split a stack, open a container, read a letter, or load ammo. Name the item as the bags journal shows it. Opening a container takes all items inside it.",
    guidelines: ["Wear an upgrade only when the game log names it an upgrade."],
    label: "Gear",
  },
};

export const gearTool = defineGameTool(gearSpec);
