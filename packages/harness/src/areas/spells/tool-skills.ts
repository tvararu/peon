import type { AreaState } from "@peon/core";
import { wholeNumber } from "#harness/areas/spells/book";
import type {
  SpellAfter,
  SpellArgs,
  SpellCtx,
} from "#harness/areas/spells/tool";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const GONE_WITHIN_MS = 3000;
const ELEMENTS = ["fire", "earth", "water", "air"] as const;

type Element = (typeof ELEMENTS)[number];
type Spells = AreaState<"spells">;

function skillOf(handle: SpellCtx["handle"], text: string) {
  const id = wholeNumber(text);
  const skills: Spells["skills"] = handle.spells.state().skills;
  if (id !== undefined) return skills.find((skill) => skill.id === id);
  const wanted = text.trim().toLowerCase();
  return skills.find((skill) => skill.name.toLowerCase() === wanted);
}

function goneSkill(event: Heard, handle: SpellCtx["handle"], id: number) {
  if (!("area" in event))
    return !handle.spells.state().skills.some((skill) => skill.id === id);
  if (event.area !== "spells") return false;
  const inner = event.event;
  return inner.type === "skill_removed" && inner.id === id;
}

export async function skillsFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const { handle, rt, signal } = ctx;
  if (args.spell === undefined || args.spell.trim() === "")
    throw new Refusal({
      detail: "name the profession to drop.",
      next: nextCall("journal", { about: "spells" }),
      reason: "missing_spell",
    });
  if (args.confirm !== true)
    throw new Refusal({
      detail: `dropping a profession loses its progress. Repeat with confirm: true to drop ${args.spell.trim()}.`,
      next: nextCall("spell", {
        confirm: true,
        do: "unlearn_profession",
        spell: args.spell,
      }),
      reason: "needs_confirm",
    });
  const skill = skillOf(handle, args.spell);
  if (skill === undefined)
    throw new Refusal({
      detail: `you know no profession "${args.spell.trim()}".`,
      next: nextCall("journal", { about: "spells" }),
      reason: "not_profession",
    });
  const after: SpellAfter = {
    do: "unlearn_profession",
    slot: undefined,
    spell: { id: skill.id, name: skill.name },
    target: undefined,
  };
  const dropped = await settle<Heard>({
    match: (event) => goneSkill(event, handle, skill.id),
    send: () =>
      rt.mutex.run(() => {
        const outcome = handle.spells.act.unlearnSkill(skill.id);
        if (!outcome.ok)
          throw new Refusal({
            detail: `${skill.name} cannot be dropped: the server refused (${outcome.reason}).`,
            next: nextCall("journal", { about: "spells" }),
            reason: outcome.reason,
          });
      }),
    signal,
    subscribe: hearCasts(handle),
    timeoutMs: GONE_WITHIN_MS,
  });
  if (dropped)
    return result("DONE", {
      after,
      detail: `Dropped ${skill.name}.`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `${skill.name} was still known 3 s after the unlearn.`,
    next: nextCall("journal", { about: "spells" }),
    reason: "no_reply",
  });
}

function goneTotem(
  event: Heard,
  handle: SpellCtx["handle"],
  slot: number,
): boolean {
  if (!("area" in event))
    return handle.spells.state().totems[slot] === undefined;
  if (event.area !== "spells") return false;
  const inner = event.event;
  return (
    inner.type === "totem_gone" &&
    inner.slot === slot &&
    inner.reason !== "replaced" &&
    handle.spells.state().totems[slot] === undefined
  );
}

export async function totemFlow(
  args: SpellArgs,
  ctx: SpellCtx,
): Promise<ToolResult<SpellAfter>> {
  const { handle, rt, signal } = ctx;
  const text = (args.element ?? "").trim().toLowerCase();
  const slot = (ELEMENTS as readonly string[]).indexOf(text);
  if (slot < 0)
    throw new Refusal({
      detail: `name the totem's element: ${ELEMENTS.join(", ")}.`,
      next: nextCall("journal", { about: "spells" }),
      reason: "unknown_element",
    });
  const element: Element = ELEMENTS[slot] ?? "fire";
  const after: SpellAfter = {
    do: "destroy_totem",
    slot,
    spell: undefined,
    target: undefined,
  };
  const destroyed = await settle<Heard>({
    match: (event) => goneTotem(event, handle, slot),
    send: () =>
      rt.mutex.run(() => {
        const outcome = handle.spells.act.destroyTotem(slot);
        if (!outcome.ok)
          throw new Refusal({
            detail: `no ${element} totem stands to destroy.`,
            next: nextCall("journal", { about: "spells" }),
            reason: outcome.reason,
          });
      }),
    signal,
    subscribe: hearCasts(handle),
    timeoutMs: GONE_WITHIN_MS,
  });
  if (destroyed)
    return result("DONE", {
      after,
      detail: `Destroyed the ${element} totem.`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: `the ${element} totem still stood 3 s after the destroy.`,
    next: nextCall("journal", { about: "spells" }),
    reason: "no_reply",
  });
}
