import { describe, expect, jest, test } from "bun:test";
import {
  characterRun,
  characterSpec,
  emptyCharacter,
} from "#harness/areas/character/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function world() {
  return await createTestRuntime({});
}

describe("character tool", () => {
  test("played reports both counters", async () => {
    const t = await world();
    const ctx = toolCtx(t, new AbortController().signal);
    jest.spyOn(t.handle.character.act, "playedTime").mockResolvedValue({
      levelSeconds: 20,
      totalSeconds: 100,
      trigger: false,
    });
    const out = await characterRun({ do: "played" }, ctx);
    expect(out.status).toEqual("DONE");
    expect(out.after).toMatchObject({
      do: "played",
      levelSeconds: 20,
      totalSeconds: 100,
    });
    expect(out.detail).toContain("100s");
  });

  test("sheathe draws and sheathes without waiting", async () => {
    const t = await world();
    const ctx = toolCtx(t, new AbortController().signal);
    const draw = jest.spyOn(t.handle.character.act, "setSheathed");
    await characterRun({ do: "sheathe", show: true }, ctx);
    expect(draw).toHaveBeenCalledWith("melee");
    await characterRun({ do: "sheathe", show: false }, ctx);
    expect(draw).toHaveBeenCalledWith("unarmed");
  });

  test("helm and cloak toggle visibility", async () => {
    const t = await world();
    const ctx = toolCtx(t, new AbortController().signal);
    const helm = jest.spyOn(t.handle.character.act, "setHelmShown");
    const cloak = jest.spyOn(t.handle.character.act, "setCloakShown");
    await characterRun({ do: "helm", show: false }, ctx);
    await characterRun({ do: "cloak", show: true }, ctx);
    expect(helm).toHaveBeenCalledWith(false);
    expect(cloak).toHaveBeenCalledWith(true);
  });

  test("barber refuses without a seat and styles when seated", async () => {
    const t = await world();
    const ctx = toolCtx(t, new AbortController().signal);
    await expect(characterRun({ do: "barber" }, ctx)).rejects.toMatchObject({
      reason: "not_seated",
    });
    jest.spyOn(t.handle.character, "state").mockReturnValue({
      barberOpen: true,
    } as never);
    const style = jest
      .spyOn(t.handle.character.act, "styleAtBarber")
      .mockResolvedValue({ code: 0, result: "ok" });
    const out = await characterRun({ do: "barber", hair: 3 }, ctx);
    expect(style).toHaveBeenCalledWith({
      color: 0,
      facialHair: 0,
      hair: 3,
      skinColor: 0,
    });
    expect(out.status).toEqual("DONE");
  });

  test("spec carries the fallback and minimal call", () => {
    expect(characterSpec.fallback()).toEqual(emptyCharacter());
    expect(characterSpec.minimalArgs).toEqual({ do: "played" });
  });
});
