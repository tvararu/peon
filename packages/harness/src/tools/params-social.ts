import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const socialParams = Type.Object({
  do: Type.Optional(
    StringEnum(
      [
        "say",
        "whisper",
        "party",
        "guild",
        "invite",
        "accept_invite",
        "decline_invite",
        "leave_group",
        "emote",
      ],
      {
        description: "Default: whisper when to is set, else say.",
      },
    ),
  ),
  text: Type.Optional(
    Type.String({ description: "What to say.", maxLength: 255 }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        "Exact player name for whisper or invite, as the [game] line shows it; for emote a unit name or ref like u3.",
    }),
  ),
  what: Type.Optional(
    Type.String({
      description: "The emote name for do:emote, like wave or dance.",
      maxLength: 32,
    }),
  ),
});

export type SocialArgs = Static<typeof socialParams>;
