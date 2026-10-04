import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { ObjectRow } from "#harness/areas/objects/reads";
import type { ToolCtx } from "#harness/contract/services";

export const mailParams = Type.Object({
  copper: Type.Optional(
    Type.Number({
      description:
        "For send: copper to enclose as a copper count (100 copper is 1 silver, 10000 is 1 gold), before the 30 copper postage. Default 0.",
    }),
  ),
  do: StringEnum(["check", "take", "send"], {
    description:
      "check: read the waiting letters. take: collect copper and items from one letter, or every letter. send: post a letter with copper or items. Default check.",
  }),
  items: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'For send: items carried in your bags, as journal bags shows them. A named stack goes whole; use "bag 255 slot 25" to pick one of two stacks with the same name.',
    }),
  ),
  mail: Type.Optional(
    Type.Union([Type.Integer({ minimum: 1 }), Type.String()], {
      description:
        'For take: the letter number from check, or "all" for every letter. Default all.',
    }),
  ),
  pay_cod: Type.Optional(
    Type.Boolean({
      description:
        "For take: true pays the cash-on-delivery fee when the letter asks for it.",
    }),
  ),
  subject: Type.Optional(
    Type.String({
      description: 'For send: the letter subject, like "Supplies".',
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "For send: the letter body.",
    }),
  ),
  to: Type.Optional(
    Type.String({
      description:
        'For send: the character who gets the letter, like "Thrall".',
    }),
  ),
});

export type MailArgs = Static<typeof mailParams>;

export type MailDo = "check" | "take" | "send";

export type MailAfter = {
  do: MailDo;
  letters: number;
  taken: string[];
  sentTo: string | undefined;
};

export type MailCtx = ToolCtx<MailAfter>;

export type MailboxPick =
  | { found: true; guid: bigint }
  | { found: false; known: readonly ObjectRow[] };
