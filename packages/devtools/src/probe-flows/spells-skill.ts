import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const SKILL_WAIT_MS = 10_000;
const POLL_MS = 100;

function skillOf(args: Readonly<Record<string, string>>): number {
  const id = Number(args["unlearn"] ?? "");
  if (!Number.isInteger(id) || id <= 0)
    throw new Error(
      `spells-skill needs unlearn=<id>, not "${args["unlearn"]}".`,
    );
  return id;
}

async function until(test: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await Bun.sleep(POLL_MS);
  }
  return test();
}

function skillsOf(handle: FlowContext["handle"]) {
  return handle.spells.state().skills;
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const id = skillOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  const before = skillsOf(handle).find((skill) => skill.id === id);
  const result = handle.spells.act.unlearnSkill(id);
  if (!result.ok)
    return {
      before: before
        ? { max: before.max, name: before.name, value: before.value }
        : null,
      id,
      stop: "refused",
      unlearn: result.reason,
    };
  const gone = await until(
    () => !skillsOf(handle).some((skill) => skill.id === id),
    SKILL_WAIT_MS,
  );
  return {
    before: before
      ? { max: before.max, name: before.name, value: before.value }
      : null,
    id,
    stop: gone ? "skill_removed" : "skill_kept",
    unlearn: "ok",
  };
}

export const flow: ProbeFlow = {
  name: "spells-skill",
  run,
  usage:
    "--flow spells-skill --arg unlearn=<id>: send CMSG_UNLEARN_SKILL for the skill, then wait for the next self update to clear its slot.",
};
