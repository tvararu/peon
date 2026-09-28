import type { StopAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunRecord } from "#harness/contract/runs";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import type { Game } from "#harness/loops/game";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { vitalsView } from "#harness/ops/views";
import { defineGameTool, emptyVitals, result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
import { type StopArgs, stopParams } from "#harness/tools/params-stop";
import { stopRenderers } from "#harness/ui/renderers/line";

function emptyStop(): StopAfter {
  return { attackers: [], self: emptyVitals(), stopped: [] };
}

function haltAll(handle: Game): void {
  handle.halt();
  handle.stopCycle();
  handle.stopAttack();
}

function stopOne(rt: HarnessRuntime, id: string): RunRecord {
  const record = rt.runs.get(id);
  if (!record)
    throw new Refusal({
      detail: `there is no run "${id}".`,
      next: nextCall("stop"),
      reason: "no_such_run",
    });
  return rt.runs.cancel(id, "tool") ?? record;
}

function runText({ id, kind, progress }: RunRecord): string {
  return progress ? `${id} (${kind}, ${progress})` : `${id} (${kind})`;
}

function stopText({ self, stopped }: StopAfter): string {
  const what =
    stopped.length > 0
      ? `stopped ${stopped.map(runText).join(", ")}.`
      : "nothing was running.";
  return `${what} Not moving, not attacking. HP ${self.hp}/${self.maxHp}.`;
}

async function stop(
  args: StopArgs,
  ctx: ToolCtx<StopAfter>,
): Promise<ToolResult<StopAfter>> {
  const { handle, rt } = ctx;
  const id = args.run?.trim();
  const stopped = id ? [stopOne(rt, id)] : rt.stopAll("tool");
  if (id) await rt.mutex.run(() => haltAll(handle));
  const after: StopAfter = {
    attackers: dangerView(ctx).attackers,
    self: vitalsView(ctx),
    stopped,
  };
  return result("DONE", { after, detail: stopText(after) });
}

export const stopTool = defineGameTool({
  fallback: emptyStop,
  kind: "control",
  minimalArgs: {},
  name: "stop",
  parameters: stopParams,
  renderers: stopRenderers,
  run: stop,
  text: {
    description:
      "Stops one running action, or everything when run is empty. It stops movement, attacks and the fight helper. An attacker does not stop when you stop.",
    guidelines: [
      "Use stop only when the task changes. Do not use it to wait for an action.",
    ],
    label: "Stop",
  },
});
