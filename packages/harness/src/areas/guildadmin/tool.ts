import {
  runLog,
  runPermissions,
  runStatus,
} from "#harness/areas/guildadmin/tool-read";
import { refuse } from "#harness/areas/guildadmin/tool-run";
import { runEmblem, runTabard } from "#harness/areas/guildadmin/tool-tabard";
import {
  type GuildAfter,
  type GuildArgs,
  type GuildCtx,
  type GuildDo,
  guildParams,
} from "#harness/areas/guildadmin/tool-types";
import {
  runDisband,
  runInfoText,
  runNote,
  runRank,
} from "#harness/areas/guildadmin/tool-write";
import type { ToolResult } from "#harness/contract/result";
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

export function emptyGuild(): GuildAfter {
  return { do: "status", target: undefined };
}

export function runGuild(
  args: GuildArgs,
  ctx: GuildCtx,
): Promise<ToolResult<GuildAfter>> {
  const verb = (args.do ?? "status") as GuildDo;
  if (verb === "status") return runStatus(ctx);
  if (verb === "permissions") return runPermissions(ctx);
  if (verb === "log") return runLog(ctx);
  if (verb === "rank") return runRank(args, ctx);
  if (verb === "note") return runNote(args, ctx, false);
  if (verb === "officer_note") return runNote(args, ctx, true);
  if (verb === "info_text") return runInfoText(args, ctx);
  if (verb === "tabard") return runTabard(args, ctx);
  if (verb === "emblem") return runEmblem(args, ctx);
  if (verb === "disband") return runDisband(args, ctx);
  throw refuse("unknown_verb", `Unknown guild verb ${String(verb)}.`);
}

function guildCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "status",
      argText(args, "step"),
      argText(args, "name"),
    ],
    theme,
    verb: "guild",
  });
}

function guildBody({ expanded, result: out }: BodyInit<GuildAfter>): string[] {
  return expanded ? out.body : [];
}

const guildRenderers: ToolRenderers<"guild", GuildAfter> = {
  renderCall: callRenderer(guildCall),
  renderResult: resultRenderer("guild", guildBody),
};

export const guildSpec: GameToolSpec<typeof guildParams, "guild", GuildAfter> =
  {
    allowStopped: (args) =>
      ["status", "permissions", "log"].includes(args.do ?? "status"),
    fallback: emptyGuild,
    kind: "action",
    maxLines: 30,
    minimalArgs: { do: "status" },
    name: "guild",
    parameters: guildParams,
    renderers: guildRenderers,
    run: runGuild,
    text: {
      description:
        "Read your guild and rank rights, change ranks, member notes and the info text as leader, read the event log, and open the tabard designer to save an emblem.",
      guidelines: [
        "Call status first so rank numbers and member names are known.",
        "Changes need the rank right. A silent answer means the server refused without a reason.",
      ],
      label: "Guild",
    },
  };

export const guildTool = defineGameTool(guildSpec);
