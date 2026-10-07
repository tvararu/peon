import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { AreaState } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export const guildbankParams = Type.Object({
  bag: Type.Optional(
    Type.Integer({
      description:
        "For deposit: the bag holding the item, as journal bags shows it. For withdraw: the bag the item lands in. Default 255 (the backpack).",
    }),
  ),
  copper: Type.Optional(
    Type.Number({
      description:
        "For deposit_money and withdraw_money: copper to move (100 copper is 1 silver, 10000 is 1 gold).",
    }),
  ),
  do: StringEnum(
    [
      "open",
      "show",
      "buy",
      "rename",
      "deposit_money",
      "withdraw_money",
      "deposit",
      "withdraw",
      "move",
      "text",
      "log",
      "limits",
    ],
    {
      description:
        "open: open the vault at a nearby guild vault. show: read a tab. buy: buy the next tab. rename: set a tab name and icon. deposit_money, withdraw_money: move copper. deposit, withdraw: move an item. move: move an item between vault slots. text: read or set the tab text. log: read the tab log. limits: read today's remaining withdrawals. Default show.",
    },
  ),
  icon: Type.Optional(
    Type.String({
      description: 'For rename: the tab icon, like "INV_Misc_Coin_01".',
    }),
  ),
  item: Type.Optional(
    Type.String({
      description:
        'For deposit and withdraw: the item, as journal bags or the last show names it, or "bag 255 slot 25".',
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "For rename: the new tab name.",
    }),
  ),
  slot: Type.Optional(
    Type.Integer({
      description:
        "For deposit, withdraw and move: the vault slot (0-97), or the bag slot for deposit and withdraw.",
    }),
  ),
  tab: Type.Optional(
    Type.Integer({
      description: "The vault tab (0-5). Default 0.",
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: "For text: the new tab text. Omit to only read it.",
    }),
  ),
  to_slot: Type.Optional(
    Type.Integer({
      description: "For move: the destination vault slot.",
    }),
  ),
  to_tab: Type.Optional(
    Type.Integer({
      description: "For move: the destination vault tab. Default tab.",
    }),
  ),
});

export type GuildBankArgs = Static<typeof guildbankParams>;

export type GuildBankDo =
  | "open"
  | "show"
  | "buy"
  | "rename"
  | "deposit_money"
  | "withdraw_money"
  | "deposit"
  | "withdraw"
  | "move"
  | "text"
  | "log"
  | "limits";

export type GuildBankAfter = {
  do: GuildBankDo;
  tab: number;
  money: string | undefined;
  lines: string[];
};

export type GuildBankCtx = ToolCtx<GuildBankAfter>;
export type GuildBankState = AreaState<"guildbank">;
