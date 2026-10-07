import type { AreaState } from "@peon/core";

type Battlegrounds = AreaState<"battlegrounds">;
type Arena = AreaState<"arena">;
type Slots = Battlegrounds["queue"]["slots"];

const BG_NAMES: Readonly<Record<number, string>> = {
  1: "Alterac Valley",
  2: "Warsong Gulch",
  3: "Arathi Basin",
  7: "Eye of the Storm",
  9: "Strand of the Ancients",
  30: "Isle of Conquest",
  32: "Random Battleground",
};

function slotText(slot: Slots[number], index: number): string | undefined {
  if (slot.kind === "none") return undefined;
  if (slot.kind === "leaving") return `leaving a battleground (slot ${index})`;
  const bg = BG_NAMES[slot.bgType] ?? slot.bgType;
  if (slot.kind === "queued") return `queued for ${bg} (slot ${index})`;
  if (slot.kind === "invited") return `invited to ${bg} (slot ${index})`;
  return `in ${bg} (slot ${index})`;
}

function queueText(slots: Slots): string[] {
  const rows: string[] = [];
  for (const [index, slot] of slots.entries()) {
    const text = slotText(slot, index);
    if (text !== undefined) rows.push(text);
  }
  return rows;
}

function scoreText(
  match: NonNullable<Battlegrounds["match"]["current"]>,
): string {
  const bg = BG_NAMES[match.bgType] ?? match.bgType;
  const where = `in ${bg}, map ${match.mapId}`;
  if (match.score === undefined) return `${where}, no score yet`;
  if (match.score.ended)
    return `${where}, ended, winner team ${match.score.winner}`;
  return `${where}, ${match.score.players.length} on the board`;
}

function insideText(match: Battlegrounds["match"]["current"]): string[] {
  return match === undefined ? [] : [scoreText(match)];
}

function arenaText(arena: Arena): string[] {
  const teams = Object.values(arena.teams);
  if (teams.length === 0) return [];
  const rows = teams
    .map((team) => `${team.type}v${team.type} ${team.rating}`)
    .join(", ");
  const one = teams.length === 1;
  return [`${teams.length} arena team${one ? "" : "s"} (${rows})`];
}

function flagText(self: Battlegrounds["self"]): string[] {
  if (self.wantsFlag) return ["PvP flag on"];
  if (self.timer) return ["PvP flag off, removal counting down"];
  return [];
}

function currencyText(self: Battlegrounds["self"]): string[] {
  const rows: string[] = [];
  if (self.honor !== undefined && self.honor > 0)
    rows.push(`${self.honor} honor`);
  if (self.arenaPoints !== undefined && self.arenaPoints > 0)
    rows.push(`${self.arenaPoints} arena points`);
  return rows;
}

export function pvpLookLine(bg: Battlegrounds, arena: Arena): string[] {
  const parts = [
    ...flagText(bg.self),
    ...currencyText(bg.self),
    ...queueText(bg.queue.slots),
    ...insideText(bg.match.current),
    ...arenaText(arena),
  ];
  if (parts.length === 0) return [];
  return [`PvP: ${parts.join("; ")}.`];
}
