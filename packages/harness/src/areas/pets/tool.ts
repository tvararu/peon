import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
  orderCommand,
  stanceCommand,
  statusResult,
} from "#harness/areas/pets/tool-command";
import { abandonFlow, renameFlow } from "#harness/areas/pets/tool-name";
import {
  autocastFlow,
  castFlow,
  tameFlow,
} from "#harness/areas/pets/tool-spell";
import { attackCommand, summonCommand } from "#harness/areas/pets/tool-summon";
import { talentFlow } from "#harness/areas/pets/tool-talent";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const petParams = Type.Object({
  do: Type.Optional(
    StringEnum(
      [
        "call",
        "dismiss",
        "revive",
        "attack",
        "follow",
        "stay",
        "stop",
        "stance",
        "cast",
        "autocast",
        "rename",
        "abandon",
        "tame",
        "talent",
      ],
      {
        description:
          'call: bring the pet out. dismiss: send it away. revive: bring a dead pet back. attack: send it at a unit. follow: call it back to you. stay: hold it where it stands. stop: stop its attack and call it back. stance: set its stance. cast: have the pet cast one of its spells on target. autocast: turn a pet spell autocast on or off with what like "Growl off". rename: rename the pet to what. abandon: abandon the pet; what must equal its current name. tame: tame target with Tame Beast. talent: learn a pet talent by name or id, or list the points and tree with no what.',
      },
    ),
  ),
  target: Type.Optional(
    Type.String({
      description: 'For attack: a unit ref like "u3" from look.',
    }),
  ),
  what: Type.Optional(
    Type.String({
      description:
        'For stance: "passive", "defensive" or "aggressive". For talent: the pet talent name or id.',
    }),
  ),
});

import type {
  PetAfter,
  PetArgs,
  PetCtx,
} from "#harness/areas/pets/tool-command";

function emptyPet(): PetAfter {
  return { do: "status", target: undefined, what: undefined };
}

type PetHandler = (args: PetArgs, ctx: PetCtx) => Promise<ToolResult<PetAfter>>;

const petHandlers: Record<NonNullable<PetArgs["do"]>, PetHandler> = {
  abandon: (args, ctx) => abandonFlow(args.what ?? "", ctx),
  attack: attackCommand,
  autocast: autocastFlow,
  call: (_args, ctx) => summonCommand("call", ctx),
  cast: castFlow,
  dismiss: (_args, ctx) => summonCommand("dismiss", ctx),
  follow: (_args, ctx) => orderCommand("follow", ctx),
  rename: (args, ctx) => renameFlow(args.what ?? "", ctx),
  revive: (_args, ctx) => summonCommand("revive", ctx),
  stance: stanceCommand,
  stay: (_args, ctx) => orderCommand("stay", ctx),
  stop: (_args, ctx) => orderCommand("stop", ctx),
  talent: (args, ctx) => talentFlow(args.what ?? "", ctx),
  tame: tameFlow,
};

function petRun(args: PetArgs, ctx: PetCtx): Promise<ToolResult<PetAfter>> {
  if (args.do === undefined)
    return Promise.resolve(statusResult(ctx.handle, ctx.rt.clock.now()));
  const handler = petHandlers[args.do];
  if (handler !== undefined) return handler(args, ctx);
  throw new Refusal({
    detail: `pet cannot ${args.do} yet.`,
    next: nextCall("pet"),
    reason: "not_built",
  });
}

function petCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "status",
      argText(args, "what") ?? argText(args, "target"),
    ],
    theme,
    verb: "pet",
  });
}

function petBody({ expanded, result: out }: BodyInit<PetAfter>): string[] {
  return expanded ? out.body : [];
}

const petRenderers: ToolRenderers<"pet", PetAfter> = {
  renderCall: callRenderer(petCall),
  renderResult: resultRenderer("pet", petBody),
};

export const petSpec: GameToolSpec<typeof petParams, "pet", PetAfter> = {
  fallback: emptyPet,
  kind: "action",
  maxLines: 30,
  minimalArgs: { do: "follow" },
  name: "pet",
  parameters: petParams,
  renderers: petRenderers,
  run: petRun,
  text: {
    description:
      "Control your pet: call, dismiss, revive, attack, follow, stay, stop, set its stance, cast or autocast its spells, rename or abandon it.",
    guidelines: [
      "Before a group pull, set the stance to passive or defensive.",
    ],
    label: "Pet",
  },
};

export const petTool = defineGameTool(petSpec);
