import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import { routeMount } from "#harness/areas/selfstate/mount-verbs";
import type { SpellRef } from "#harness/areas/spells/book";
import { cancelAuraFlow } from "#harness/areas/spells/tool-aura";
import { barFlow } from "#harness/areas/spells/tool-bar";
import { castFlow } from "#harness/areas/spells/tool-cast";
import { skillsFlow, totemFlow } from "#harness/areas/spells/tool-skills";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const spellParams = Type.Object({
  confirm: Type.Optional(
    Type.Boolean({
      description: "For unlearn_profession: repeat the call with true.",
    }),
  ),
  do: StringEnum(
    [
      "cast",
      "cancel_aura",
      "bar",
      "mount",
      "dismount",
      "unlearn_profession",
      "destroy_totem",
    ],
    {
      description:
        "cast: cast a spell. cancel_aura: remove one of your own buffs. bar: put a spell or an item on an action bar slot. mount: get on a mount. dismount: get off a mount. unlearn_profession: drop a profession. destroy_totem: remove one of your totems.",
    },
  ),
  element: Type.Optional(
    Type.String({
      description: "For destroy_totem: fire, earth, water or air.",
    }),
  ),
  item: Type.Optional(
    Type.String({
      description:
        "For bar: an item in your bags by name, or an item id. Leave out spell and item to clear the slot.",
    }),
  ),
  slot: Type.Optional(
    Type.Integer({
      description: "For bar: the action bar slot, 1 to 144.",
      maximum: 144,
      minimum: 1,
    }),
  ),
  spell: Type.Optional(
    Type.String({
      description:
        "The spell name or id. For cancel_aura: the buff to remove. For bar: the spell to place. For mount: the mount name or id, or leave out to pick a ground mount. For unlearn_profession: the profession name or skill id.",
    }),
  ),
  target: Type.Optional(
    Type.String({
      description:
        'For cast: a unit ref like "u3" from look. Default: yourself.',
    }),
  ),
});

export type SpellArgs = Static<typeof spellParams>;
export type SpellDo =
  | "cast"
  | "cancel_aura"
  | "bar"
  | "mount"
  | "dismount"
  | "unlearn_profession"
  | "destroy_totem";

export type SpellAfter = {
  do: SpellDo;
  spell: SpellRef | undefined;
  target: string | undefined;
  slot: number | undefined;
};

export type SpellCtx = ToolCtx<SpellAfter>;

export function emptySpell(): SpellAfter {
  return { do: "cast", slot: undefined, spell: undefined, target: undefined };
}

function spellRun(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  if (args.do === "mount" || args.do === "dismount")
    return routeMount(args, ctx);
  if (args.do === "cancel_aura") return cancelAuraFlow(args, ctx);
  if (args.do === "bar") return barFlow(args, ctx);
  if (args.do === "unlearn_profession") return skillsFlow(args, ctx);
  if (args.do === "destroy_totem") return totemFlow(args, ctx);
  return castFlow(args, ctx);
}

function spellCall(args: unknown, theme: CallInit["theme"]): string {
  const slot = argText(args, "slot");
  const target = argText(args, "target");
  return callLine({
    icon: "spell",
    parts: [
      argText(args, "do"),
      argText(args, "spell") ??
        argText(args, "item") ??
        argText(args, "element"),
      slot && `slot ${slot}`,
      target && `→ ${target}`,
    ],
    theme,
    verb: "spell",
  });
}

function spellBody({ expanded, result }: BodyInit<SpellAfter>): string[] {
  return expanded ? result.body : [];
}

const spellRenderers: ToolRenderers<"spell", SpellAfter> = {
  renderCall: callRenderer(spellCall),
  renderResult: resultRenderer("spell", spellBody),
};

export const spellSpec: GameToolSpec<typeof spellParams, "spell", SpellAfter> =
  {
    fallback: emptySpell,
    kind: "action",
    minimalArgs: { do: "cast", spell: "Frost Armor" },
    name: "spell",
    parameters: spellParams,
    renderers: spellRenderers,
    run: spellRun,
    text: {
      description:
        "Cast a spell by name or id, on yourself or on a unit you have seen. Remove one of your own buffs. Put a spell or an item on an action bar slot. Drop a profession with confirm. Remove one of your totems by element. You cannot cast while you channel another spell.",
      guidelines: [
        "Read the spells you know with journal about spells before you cast.",
      ],
      label: "Spell",
    },
  };

export const spellTool = defineGameTool(spellSpec);
