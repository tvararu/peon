import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import { abortable } from "@peon/core/lib/abort";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const characterParams = Type.Object({
  color: Type.Optional(
    Type.Number({
      description: "For barber: the hair color index. Default 0.",
    }),
  ),
  do: StringEnum(["played", "sheathe", "helm", "cloak", "barber"], {
    description:
      "played: read total and level play time. sheathe: draw or sheathe weapons. helm: show or hide the helm. cloak: show or hide the cloak. barber: change hairstyle while seated in a barber chair. Default played.",
  }),
  facial: Type.Optional(
    Type.Number({
      description: "For barber: the facial hair style index. Default 0.",
    }),
  ),
  hair: Type.Optional(
    Type.Number({
      description: "For barber: the hair style index. Default 0.",
    }),
  ),
  show: Type.Optional(
    Type.Boolean({
      description:
        "For sheathe, helm and cloak: true draws or shows, false sheathes or hides. Default true.",
    }),
  ),
  skin: Type.Optional(
    Type.Number({
      description: "For barber: the skin color index. Default 0.",
    }),
  ),
});

export type CharacterArgs = Static<typeof characterParams>;
export type CharacterDo = "played" | "sheathe" | "helm" | "cloak" | "barber";

export type CharacterAfter = {
  do: CharacterDo;
  totalSeconds: number | undefined;
  levelSeconds: number | undefined;
  barber: string | undefined;
};

export type CharacterCtx = ToolCtx<CharacterAfter>;

export function emptyCharacter(): CharacterAfter {
  return {
    barber: undefined,
    do: "played",
    levelSeconds: undefined,
    totalSeconds: undefined,
  };
}

function afterOf(
  verb: CharacterDo,
  over: Partial<CharacterAfter> = {},
): CharacterAfter {
  return { ...emptyCharacter(), do: verb, ...over };
}

function playedBody(total: number, level: number): string[] {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [`played: ${hours}h ${minutes}m total, ${level}s at this level`];
}

async function runPlayed(
  ctx: CharacterCtx,
): Promise<ToolResult<CharacterAfter>> {
  const act = ctx.handle.character.act;
  const played = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.playedTime(), ctx.signal);
  });
  return result("DONE", {
    after: afterOf("played", {
      levelSeconds: played.levelSeconds,
      totalSeconds: played.totalSeconds,
    }),
    body: playedBody(played.totalSeconds, played.levelSeconds),
    detail: `Played ${played.totalSeconds}s total, ${played.levelSeconds}s at this level.`,
  });
}

async function runSheathe(
  args: CharacterArgs,
  ctx: CharacterCtx,
): Promise<ToolResult<CharacterAfter>> {
  const show = args.show ?? true;
  const act = ctx.handle.character.act;
  await ctx.rt.mutex.run(() => {
    ctx.signal.throwIfAborted();
    act.setSheathed(show ? "melee" : "unarmed");
  });
  return result("DONE", {
    after: afterOf("sheathe"),
    body: [],
    detail: show ? "Weapons drawn." : "Weapons sheathed.",
  });
}

async function runVisibility(
  verb: "helm" | "cloak",
  args: CharacterArgs,
  ctx: CharacterCtx,
): Promise<ToolResult<CharacterAfter>> {
  const show = args.show ?? true;
  const act = ctx.handle.character.act;
  await ctx.rt.mutex.run(() => {
    ctx.signal.throwIfAborted();
    if (verb === "helm") act.setHelmShown(show);
    else act.setCloakShown(show);
  });
  const item = verb === "helm" ? "Helm" : "Cloak";
  return result("DONE", {
    after: afterOf(verb),
    body: [],
    detail: show ? `${item} shown.` : `${item} hidden.`,
  });
}

async function runBarber(
  args: CharacterArgs,
  ctx: CharacterCtx,
): Promise<ToolResult<CharacterAfter>> {
  const open = ctx.handle.character.state().barberOpen;
  if (!open)
    throw new Refusal({
      detail: "Sit in a barber chair first, then change the style.",
      next: "character(do: played)",
      reason: "not_seated",
    });
  const act = ctx.handle.character.act;
  const style = {
    color: args.color ?? 0,
    facialHair: args.facial ?? 0,
    hair: args.hair ?? 0,
    skinColor: args.skin ?? 0,
  };
  const outcome = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(act.styleAtBarber(style), ctx.signal);
  });
  if (outcome.result !== "ok")
    throw new Refusal({
      detail: `The barber kept the old style (${outcome.result}).`,
      next: "character(do: played)",
      reason: outcome.result,
    });
  return result("DONE", {
    after: afterOf("barber", { barber: "ok" }),
    body: [],
    detail: "The barber changed the hairstyle.",
  });
}

export function characterRun(
  args: CharacterArgs,
  ctx: CharacterCtx,
): Promise<ToolResult<CharacterAfter>> {
  const verb = (args.do ?? "played") as CharacterDo;
  if (verb === "played") return runPlayed(ctx);
  if (verb === "sheathe") return runSheathe(args, ctx);
  if (verb === "helm") return runVisibility("helm", args, ctx);
  if (verb === "cloak") return runVisibility("cloak", args, ctx);
  if (verb === "barber") return runBarber(args, ctx);
  throw new Refusal({
    detail: `Unknown character verb ${String(verb)}. Use played, sheathe, helm, cloak or barber.`,
    next: "character(do: played)",
    reason: "unknown_verb",
  });
}

function characterCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [argText(args, "do") ?? "played"],
    theme,
    verb: "character",
  });
}

function characterBody({
  expanded,
  result: out,
}: BodyInit<CharacterAfter>): string[] {
  if (!expanded) return [];
  if (out.after.do === "played" && out.after.totalSeconds !== undefined)
    return playedBody(out.after.totalSeconds, out.after.levelSeconds ?? 0);
  return [];
}

const characterRenderers: ToolRenderers<"character", CharacterAfter> = {
  renderCall: callRenderer(characterCall),
  renderResult: resultRenderer("character", characterBody),
};

export const characterSpec: GameToolSpec<
  typeof characterParams,
  "character",
  CharacterAfter
> = {
  allowStopped: (args) => (args.do ?? "played") === "played",
  fallback: emptyCharacter,
  kind: "action",
  minimalArgs: { do: "played" },
  name: "character",
  parameters: characterParams,
  renderers: characterRenderers,
  run: characterRun,
  text: {
    description:
      "Read play time, draw or sheathe weapons, show or hide helm and cloak, or change hairstyle in a barber chair.",
    guidelines: [
      "Barber needs a barber chair seat first; the chair opens the shop.",
    ],
    label: "Character",
  },
};

export const characterTool = defineGameTool(characterSpec);
