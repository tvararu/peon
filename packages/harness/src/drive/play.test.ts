import { describe, expect, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import { Play, WIDGET } from "#harness/drive/play";
import { Refusal } from "#harness/ops/refusal";
import { admitAgent } from "#harness/tools/human-admission";
import { createWorldService } from "#harness/world/hub";
import { manualTimers } from "#test-support/drive-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const F1 = "\x1bOP";
const ESC = "\x1b";

async function setup(busy = false) {
  const { handle, rt } = await createTestRuntime();
  const world = createWorldService(rt).service;
  const notes: string[] = [];
  const widget: (string[] | undefined)[] = [];
  const claims: string[] = [];
  let aborted = 0;
  rt.control.onChange((change) => claims.push(change.owner));
  const play = new Play({
    abort: () => {
      aborted += 1;
    },
    busy: () => busy,
    handBack: (note) => notes.push(note),
    timers: manualTimers(),
    ui: () => ({
      setWidget: (key: string, lines: unknown) => {
        if (key === WIDGET) widget.push(lines as string[] | undefined);
      },
    }),
    world: () => world,
  });
  return {
    aborted: () => aborted,
    claims,
    handle,
    notes,
    play,
    rt,
    widget,
    world,
  };
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 50; tick++) await Promise.resolve();
}

describe("Play", () => {
  test("F1 claims the human once and holds it across keys and TALK", async () => {
    const { claims, handle, play, rt } = await setup();
    expect(play.input(F1)).toEqual({ consume: true });
    for (const key of ["w", "w", "a", " ", "\r", "hello"]) play.input(key);
    expect(play.current()).toBe("talk");
    expect(play.input("w")).toBeUndefined();
    play.input("\x1d");
    await flush();
    expect(claims).toEqual(["human"]);
    expect(rt.control.owner()).toBe("human");
    expect(handle.drive).toHaveBeenCalledWith(
      { move: "forward", turn: "left" },
      expect.any(Number),
    );
    expect(handle.jump).toHaveBeenCalledTimes(1);
  });

  test("the agent's acting tools refuse while the human drives", async () => {
    const { play, rt } = await setup();
    play.input(F1);
    expect(() => admitAgent(rt, "travel")).toThrow(Refusal);
    play.input(ESC);
    await flush();
    expect(() => admitAgent(rt, "travel")).not.toThrow();
  });

  test("taking over stops the agent's runs and aborts its turn", async () => {
    const { aborted, play, rt } = await setup(true);
    const run = rt.runs.start({
      args: {},
      kind: "rest",
      launch: () => Promise.withResolvers<RunEnd<undefined>>().promise,
      toolCallId: "t1",
    });
    play.input(F1);
    expect(rt.runs.get(run.id)?.reason).toBe("human_stop");
    expect(aborted()).toBe(1);
  });

  test("Esc stops the character, hands back and sends one note", async () => {
    const { handle, notes, play, rt, widget } = await setup();
    play.input(F1);
    play.input("w");
    rt.log.append({
      class: "log",
      data: {},
      domain: "combat",
      event: "combat/cast",
      text: "Cast Smite succeeded.",
    });
    rt.log.append({
      class: "log",
      data: {},
      domain: "control",
      event: "control/move_start",
      text: "You start to move.",
    });
    play.input(ESC);
    await flush();
    await flush();
    expect(handle.drive).toHaveBeenLastCalledWith({}, 1);
    expect(rt.control.owner()).toBe("none");
    expect(play.current()).toBe("talk");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toStartWith("[human] The human drove the character");
    expect(notes[0]).toContain("Cast Smite succeeded.");
    expect(notes[0]).not.toContain("You start to move.");
    expect(widget.at(-1)).toBeUndefined();
  });

  test("an action pressed just before Esc lands in that takeover's note, not the next", async () => {
    const { handle, notes, play, rt } = await setup();
    const gate = Promise.withResolvers<void>();
    rt.mutex.run(() => gate.promise);
    play.input(F1);
    play.input(" ");
    play.input(ESC);
    expect(notes).toHaveLength(0);
    gate.resolve();
    await flush();
    expect(handle.jump).toHaveBeenCalledTimes(1);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Human actions: jumped.");
    play.input(F1);
    play.input(ESC);
    await flush();
    await flush();
    expect(notes[1]).not.toContain("jumped");
  });

  test("taking over again while a hand-back finishes keeps the new takeover", async () => {
    const { play, rt } = await setup();
    const gate = Promise.withResolvers<void>();
    play.input(F1);
    rt.mutex.run(() => gate.promise);
    play.input(ESC);
    play.input(F1);
    gate.resolve();
    await flush();
    expect(play.current()).toBe("play");
    expect(play.holding()).toBe(true);
    expect(rt.control.owner()).toBe("human");
  });

  test("a closed connection ends the takeover and frees the character", async () => {
    const { notes, play, rt, widget, world } = await setup();
    play.watch(world);
    play.input(F1);
    play.input("w");
    await rt.disconnect();
    await flush();
    await flush();
    expect(rt.control.owner()).toBe("none");
    expect(play.current()).toBe("talk");
    expect(play.holding()).toBe(false);
    expect(widget.at(-1)).toBeUndefined();
    expect(notes[0]).toContain(
      "control returned to the agent because the game connection closed.",
    );
    await rt.connect();
    expect(play.input("w")).toBeUndefined();
    expect(rt.control.owner()).toBe("none");
  });

  test("F9 is left to the stop shortcut and drops the held keys", async () => {
    const { play } = await setup();
    play.input(F1);
    play.input("w");
    expect(play.input("\x1b[20~")).toBeUndefined();
    expect(play.input("\x03")).toBeUndefined();
    expect(play.holding()).toBe(true);
  });
});
