import type { WorldHandle } from "@tuicraft/core";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import { stable } from "#harness/ops/repeat-guard";
import { poseView } from "#harness/ops/views";

export type CallShape = { tool: string; args: Record<string, unknown> };

const CALL = /^([a-z_]+)\((.*)\)$/;
const ARG =
  /([a-z_]+): ("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false)(?:, |$)/y;
const GUARDED = new Set(["PARTLY", "REFUSED", "FAILED"]);
const CONTINUES = new Set(["time_limit", "cancelled"]);

function argValue(raw: string): unknown {
  if (raw === "true" || raw === "false") return raw === "true";
  return raw.startsWith('"') ? JSON.parse(raw) : Number(raw);
}

export function parseCall(text: string): CallShape | undefined {
  const [, tool, inner] = CALL.exec(text.trim()) ?? [];
  if (tool === undefined || inner === undefined) return;
  const args: Record<string, unknown> = {};
  ARG.lastIndex = 0;
  while (ARG.lastIndex < inner.length) {
    const at = ARG.lastIndex;
    const match = ARG.exec(inner);
    const [, key, raw] = match ?? [];
    if (key === undefined || raw === undefined || ARG.lastIndex === at) return;
    args[key] = argValue(raw);
  }
  return { args, tool };
}

export function guardNext<A>(
  outcome: ToolResult<A>,
  init: CallShape & { blocked: (call: CallShape) => boolean },
): ToolResult<A> {
  if (
    !GUARDED.has(outcome.status) ||
    outcome.next === undefined ||
    CONTINUES.has(outcome.reason ?? "")
  )
    return outcome;
  const call = parseCall(outcome.next);
  if (!call) return outcome;
  const same =
    call.tool === init.tool && stable(call.args) === stable(init.args);
  if (!(same || init.blocked(call))) return outcome;
  const how = outcome.status === "PARTLY" ? "stopped" : "failed";
  const why = outcome.reason ?? outcome.status.toLowerCase();
  const again = same
    ? "repeating it will not help"
    : `${call.tool} already failed from here`;
  return {
    ...outcome,
    next: `ask the human: "My ${init.tool} call ${how} (${why}) and ${again}. What should I do?"`,
  };
}

export function guardCall<A>(
  init: {
    args: unknown;
    handle: WorldHandle | undefined;
    rt: HarnessRuntime;
    tool: ToolName;
  },
  outcome: ToolResult<A>,
): ToolResult<A> {
  const { handle, rt } = init;
  const here = handle && {
    digest: rt.progress.digest(handle),
    pose: poseView({ handle, rt }),
  };
  return guardNext(outcome, {
    args: init.args as Record<string, unknown>,
    blocked: (call) =>
      here !== undefined &&
      rt.repeats.blocks({
        ...here,
        args: call.args,
        tool: call.tool as ToolName,
      }),
    tool: init.tool,
  });
}
