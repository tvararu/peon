import {
  type PetAfter,
  type PetCtx,
  petUnit,
  SETTLE_MS,
  stateOf,
  throwUnlessOk,
} from "#harness/areas/pets/tool-command";
import { type Heard, hearCasts } from "#harness/areas/spells/tool-wait";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

function stateNameOf(ctx: PetCtx): string {
  const pet = stateOf(ctx.handle).pet;
  const unit = pet ? petUnit(ctx.handle, pet.guid) : undefined;
  return unit?.name ?? "Your pet";
}

export async function renameFlow(
  what: string,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const name = what.trim();
  if (name === "")
    throw new Refusal({
      detail: 'say the new name: what "Fangtooth".',
      next: nextCall("pet", { do: "rename", what: "Fangtooth" }),
      reason: "missing_name",
    });
  if (!stateOf(ctx.handle).bar) throwNoPet("no_pet");
  const after: PetAfter = { do: "rename", target: undefined, what: name };
  const heard = await settle<Heard>({
    match: (event) =>
      "area" in event &&
      event.area === "pets" &&
      ((event.event.type === "name" && event.event.name.name === name) ||
        (event.event.type === "name_invalid" && event.event.name === name) ||
        event.event.type === "unanswered"),
    send: () =>
      ctx.rt.mutex.run(() => {
        throwUnlessOk(ctx.handle.pets.act.renamePet(name));
      }),
    signal: ctx.signal,
    subscribe: hearCasts(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard && "area" in heard && heard.area === "pets") {
    const inner = heard.event;
    if (inner.type === "name")
      return result("DONE", {
        after,
        detail: `Renamed: your pet is now ${inner.name.name}.`,
      });
    if (inner.type === "name_invalid")
      return result("REFUSED", {
        after,
        detail: `The server refused "${inner.name}": ${inner.reason}.`,
        reason: "name_invalid",
      });
    return result("UNCONFIRMED", {
      after,
      detail: "The server did not answer the rename.",
      next: nextCall("pet"),
      reason: "no_reply",
    });
  }
  return result("UNCONFIRMED", {
    after,
    detail: "The server did not answer the rename.",
    next: nextCall("pet"),
    reason: "no_reply",
  });
}

function throwNoPet(reason: string): never {
  throw new Refusal({
    detail: "you have no pet out.",
    next: nextCall("pet"),
    reason,
  });
}

export async function abandonFlow(
  what: string,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const state = stateOf(ctx.handle);
  if (!state.bar) throwNoPet("no_pet");
  const current = stateNameOf(ctx);
  if (what.trim().toLowerCase() !== current.toLowerCase())
    throw new Refusal({
      body: [`Your pet is named ${current}.`],
      detail: `abandoning is final: pass what "${current}".`,
      next: nextCall("pet", { do: "abandon", what: current }),
      reason: "confirm_name",
    });
  const after: PetAfter = { do: "abandon", target: undefined, what: current };
  const heard = await settle<Heard>({
    match: (event) =>
      "area" in event &&
      event.area === "pets" &&
      event.event.type === "bar" &&
      event.event.cleared,
    send: () =>
      ctx.rt.mutex.run(() => {
        throwUnlessOk(ctx.handle.pets.act.abandonPet());
      }),
    signal: ctx.signal,
    subscribe: hearCasts(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard)
    return result("DONE", {
      after,
      detail: `${current} is abandoned: your pet is gone.`,
    });
  return result("UNCONFIRMED", {
    after,
    detail: "Your pet is still out.",
    next: nextCall("pet"),
    reason: "no_reply",
  });
}
