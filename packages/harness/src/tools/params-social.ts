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
        "Exact player name for whisper or invite, as the [game] line shows it.",
    }),
  ),
});

export type SocialArgs = Static<typeof socialParams>;
