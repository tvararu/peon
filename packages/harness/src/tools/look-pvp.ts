import type { AreaState } from "@peon/core";

type Battlegrounds = AreaState<"battlegrounds">;
type Arena = AreaState<"arena">;

const BG_NAMES: Readonly<Record<number, string>> = {
  1: "Alterac Valley",
  2: "Warsong Gulch",
  3: "Arathi Basin",
  7: "Eye of the Storm",
  9: "Strand of the Ancients",
  30: "Isle of Conquest",
  32: "Random Battleground",
};

function queueText(slots: Battlegrounds["queue"]["slots"]): string[] {
  return slots.flatMap((slot, index) => {
    if (slot.kind === "none") return [];
    if (slot.kind === "queued")
      return [
        `queued for ${BG_NAMES[slot.bgType] ?? slot.bgType} (slot ${index})`,
      ];
    if (slot.kind === "invited")
      return [
        `invited to ${BG_NAMES[slot.bgType] ?? slot.bgType} (slot ${index})`,
      ];
    if (slot.kind === "active")
      return [`in ${BG_NAMES[slot.bgType] ?? slot.bgType} (slot ${index})`];
    return [`leaving a battleground (slot ${index})`];
  });
}

export function pvpLookLine(bg: Battlegrounds, arena: Arena): string[] {
  const self = bg.self;
  const flag = self.wantsFlag
    ? "PvP flag on"
    : self.timer
      ? "PvP flag off, removal counting down"
      : undefined;
  const honor =
    self.honor !== undefined && self.honor > 0
      ? `${self.honor} honor`
      : undefined;
  const points =
    self.arenaPoints !== undefined && self.arenaPoints > 0
      ? `${self.arenaPoints} arena points`
      : undefined;
  const queues = queueText(bg.queue.slots);
  const match = bg.match.current;
  const inside =
    match === undefined
      ? []
      : [
          [
            `in ${BG_NAMES[match.bgType] ?? match.bgType}`,
            `map ${match.mapId}`,
            match.score === undefined
              ? "no score yet"
              : match.score.ended
                ? `ended, winner team ${match.score.winner}`
                : `${match.score.players.length} on the board`,
          ].join(", "),
        ];
  const teams = Object.values(arena.teams);
  const arenaLine =
    teams.length === 0
      ? []
      : [
          `${teams.length} arena team${teams.length === 1 ? "" : "s"} (${teams
            .map((team) => `${team.type}v${team.type} ${team.rating}`)
            .join(", ")})`,
        ];
  const parts = [
    ...(flag ? [flag] : []),
    ...(honor ? [honor] : []),
    ...(points ? [points] : []),
    ...queues,
    ...inside,
    ...arenaLine,
  ];
  if (parts.length === 0) return [];
  return [`PvP: ${parts.join("; ")}.`];
}
