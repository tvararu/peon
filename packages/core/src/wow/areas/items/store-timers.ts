import type { ItemsEvent } from "#wow/areas/items/events";
import type {
  ItemCooldownPacket,
  ItemEnchantTimeUpdatePacket,
  ItemTimeUpdatePacket,
  SetProficiencyPacket,
} from "#wow/areas/items/protocol-timers";
import { proficiencyNames, type TimerSlice } from "#wow/areas/items/timers";

export type TimersHost = {
  timers: TimerSlice;
  events: { emit: (event: ItemsEvent) => void };
  now: () => number;
  entryOf: (itemGuid: bigint) => number | undefined;
};

export type TimersBehavior = {
  receiveItemCooldown: (packet: ItemCooldownPacket) => void;
  receiveItemTime: (packet: ItemTimeUpdatePacket) => void;
  receiveItemEnchantTime: (packet: ItemEnchantTimeUpdatePacket) => void;
  receiveDeathDurability: () => void;
  receiveProficiency: (packet: SetProficiencyPacket) => void;
};

export const timersBehavior = (host: TimersHost): TimersBehavior => ({
  receiveItemCooldown: (packet) => {
    host.timers.cooldown(packet, host.now());
    host.events.emit({
      type: "item_cooldown",
      itemGuid: packet.itemGuid,
      entry: host.entryOf(packet.itemGuid),
      spell: packet.spell,
    });
  },

  receiveItemTime: (packet) => {
    const { expiresAt } = host.timers.time(packet, host.now());
    host.events.emit({
      type: "item_timer",
      itemGuid: packet.itemGuid,
      entry: host.entryOf(packet.itemGuid),
      seconds: packet.seconds,
      expiresAt,
    });
  },

  receiveItemEnchantTime: (packet) => {
    const { expiresAt } = host.timers.enchant(packet, host.now());
    host.events.emit({
      type: "item_enchant_timer",
      itemGuid: packet.itemGuid,
      entry: host.entryOf(packet.itemGuid),
      slot: packet.slot,
      seconds: packet.seconds,
      expiresAt,
    });
  },

  receiveDeathDurability: () => {
    host.events.emit({ type: "durability_loss_death" });
  },

  receiveProficiency: (packet) => {
    const change = host.timers.proficiency(packet);
    if (!change) return;
    host.events.emit({
      type: "proficiency_changed",
      kind: change.kind,
      mask: packet.mask,
      added: change.added,
      names: proficiencyNames(change.kind, change.added),
    });
  },
});
