import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { ToolCtx } from "#harness/contract/services";

export const GUILD_VERBS = [
  "status",
  "permissions",
  "log",
  "rank",
  "note",
  "officer_note",
  "info_text",
  "tabard",
  "emblem",
  "disband",
] as const;

export const guildParams = Type.Object({
  background: Type.Optional(
    Type.Integer({ description: "For emblem: background color number." }),
  ),
  border_color: Type.Optional(
    Type.Integer({ description: "For emblem: border color number." }),
  ),
  border_style: Type.Optional(
    Type.Integer({ description: "For emblem: border style number." }),
  ),
  color: Type.Optional(
    Type.Integer({ description: "For emblem: emblem color number." }),
  ),
  confirm: Type.Optional(
    Type.Boolean({
      description:
        "For rank remove, emblem and disband: true confirms. Saving an emblem costs 10 gold.",
    }),
  ),
  do: Type.Optional(
    StringEnum([...GUILD_VERBS], {
      description:
        "status: read the guild. permissions: read your rank rights. log: read the guild event log. rank: add, rename or remove a rank (leader). note: set a member's public note. officer_note: set an officer note. info_text: set the guild info text. tabard: open the tabard designer. emblem: save the emblem at the tabard designer. disband: disband the guild (leader). Default status.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "For rank add or rename: the rank name, 15 characters at most. For note and officer_note: the member name.",
    }),
  ),
  npc: Type.Optional(
    Type.String({
      description:
        'For tabard and emblem: the tabard designer ref like "u3" from look. Default the nearest one.',
    }),
  ),
  rank: Type.Optional(
    Type.Integer({
      minimum: 0,
      description: "For rank rename: the rank number from status, 0 is leader.",
    }),
  ),
  step: Type.Optional(
    StringEnum(["add", "rename", "remove"], {
      description:
        "For rank: add a lowest rank, rename one, or remove the lowest rank.",
    }),
  ),
  style: Type.Optional(
    Type.Integer({ description: "For emblem: emblem style number." }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        "For note and officer_note: the note, 31 characters at most. For info_text: the text, 500 characters at most.",
    }),
  ),
});

export type GuildArgs = Static<typeof guildParams>;
export type GuildDo = (typeof GUILD_VERBS)[number];

export type GuildAfter = {
  do: GuildDo;
  target: string | undefined;
};

export type GuildCtx = ToolCtx<GuildAfter>;
