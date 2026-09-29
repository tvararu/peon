import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
  orderCommand,
  stanceCommand,
  statusResult,
} from "#harness/areas/pets/tool-command";
import { attackCommand, summonCommand } from "#harness/areas/pets/tool-summon";
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
      ],
      {
        description:
          "call: bring the pet out. dismiss: send it away. revive: bring a dead pet back. attack: send it at a unit. follow: call it back to you. stay: hold it where it stands. stop: stop its attack and call it back. stance: set its stance.",
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
      description: 'For stance: "passive", "defensive" or "aggressive".',
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

function petRun(args: PetArgs, ctx: PetCtx): Promise<ToolResult<PetAfter>> {
  if (args.do === undefined)
    return Promise.resolve(statusResult(ctx.handle, ctx.rt.clock.now()));
  if (args.do === "follow" || args.do === "stay")
    return orderCommand(args.do, ctx);
  if (args.do === "stance") return stanceCommand(args, ctx);
  if (args.do === "stop") return orderCommand("stop", ctx);
  if (args.do === "attack") return attackCommand(args, ctx);
  if (args.do === "call" || args.do === "revive" || args.do === "dismiss")
    return summonCommand(args.do, ctx);
  throw new Refusal({
    detail: `pet cannot ${args.do} yet; commands land in a later task.`,
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
