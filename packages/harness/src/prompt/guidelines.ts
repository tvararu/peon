import type { ToolName } from "#harness/contract/result";

export type ToolText = {
  label: string;
  description: string;
  guidelines: string[];
};

export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>> = {
  engage: {
    description:
      "Finds a hostile unit, walks to it, fights it and loots it. It waits until the fight ends, up to two minutes. With count or quest it fights more than one unit. It refuses when your health or mana is low or when another unit attacks you.",
    guidelines: [
      "Leave target empty to fight the nearest hostile. Use quest to fight for a quest objective.",
      "If it refuses because your health or mana is low, call rest. Then call engage again.",
    ],
    label: "Engage",
  },
  interact: {
    description:
      "Walks to an NPC and does one job with it: talk, accept or turn in a quest, gossip, buy, sell junk, train or repair. talk lists what the NPC offers, with a number for each line.",
    guidelines: [
      "talk lists what an NPC offers. Your own quest log is journal.",
      'For buy, what can be a stock line number, part of an item name (for example "water") or "item <id>".',
    ],
    label: "Interact",
  },
  journal: {
    description:
      "Reads your own records: your quest log, your bags and equipped items, the spells you know, or the game log of what happened earlier. It does not move you or act.",
    guidelines: [
      "log is history. It never loses events when you read it.",
      "Use bags to name an equipped item, for example the item in your main hand.",
    ],
    label: "Journal",
  },
  look: {
    description:
      "Shows your health, place, target and running action, and the nearest units, each with a short id like u7. It does not move you or act. Use it to start a task and to answer questions about the world.",
    guidelines: [
      "Use find to filter. The Nearest line includes units out of view.",
      "Use within to list every unit near you, for example within: 30.",
    ],
    label: "Look",
  },
  loot: {
    description:
      "Takes every item and the money from one corpse, one slot at a time. It walks to the corpse first. Leave target empty to loot the nearest lootable corpse within 30 yards.",
    guidelines: [
      "engage loots each kill already. Use loot only for a corpse that engage did not loot.",
    ],
    label: "Loot",
  },
  recover: {
    description:
      "Brings you back to life after a death. It releases your spirit, walks your ghost to your corpse and takes the corpse back. It can also use a spirit healer or accept a resurrection. It waits until you are alive or it fails.",
    guidelines: [
      "Use recover at once when a result says that you are dead. Do not use travel as a ghost.",
    ],
    label: "Recover",
  },
  rest: {
    description:
      "Eats and drinks from your bags until your health and mana reach a percent. It waits up to 30 seconds and stops if a unit attacks you. It refuses in combat and when you are dead.",
    guidelines: [
      "Rest before a fight when your health is under 50% or your mana is under 30%.",
    ],
    label: "Rest",
  },
  social: {
    description:
      "Sends one chat message or does one group action: say, whisper, party, guild, invite, accept or decline an invite, or leave the group. It waits up to 2 seconds for the server to confirm it.",
    guidelines: [
      'To answer a whisper, set do to "whisper" and to to the exact name from the [game] line.',
      "Never put an account name or a password in text.",
    ],
    label: "Social",
  },
  stop: {
    description:
      "Stops one running action, or everything when run is empty. It stops movement, attacks and the fight helper. An attacker does not stop when you stop.",
    guidelines: [
      "Use stop only when the task changes. Do not use it to wait for an action.",
    ],
    label: "Stop",
  },
  travel: {
    description:
      "Walks to a unit, to your corpse or to a point, or explores in a direction. It waits until you arrive or it fails, up to two minutes. Use explore when look does not show a unit that the task needs. Do not use it to fight.",
    guidelines: [
      "Never invent coordinates. If a refusal gives floors, use one as the third number.",
      'If a result says start_off_mesh, call travel with to "unstick". Then try the goal again.',
    ],
    label: "Travel",
  },
};
