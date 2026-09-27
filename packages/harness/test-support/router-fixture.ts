import { jest } from "bun:test";
import type { HarnessFlags } from "#harness/contract/config";
import type { AttackLedger, JsonlSink } from "#harness/contract/services";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import type { RuleContext } from "#harness/events/rules";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";

export const testFlags: HarnessFlags = {
  check: false,
  connect: true,
  glyphs: undefined,
  logEntities: false,
  model: "openai-codex/gpt-6-luna",
  nowPerCall: false,
  profile: "profile.json",
  runDir: undefined,
  stopReflex: true,
  thinking: "high",
  wake: true,
};

export function routerSetup(over: Partial<RuleContext> = {}) {
  const now = 1_000_000;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const jevRows: unknown[] = [];
  const jevLog: JsonlSink = {
    close: async () => {},
    flush: async () => {},
    write: (row) => {
      jevRows.push(row);
    },
  };
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const attacks: AttackLedger = {
    attach: () => () => {},
    lastAttacker: () => undefined,
    lastHitAt: () => undefined,
  };
  const context = (): RuleContext => ({
    now,
    refOf: (guid) => `u${guid}`,
    runActive: false,
    selfGuid: 1n,
    selfName: "Fgk",
    wake: true,
    ...over,
  });
  const router = createEventRouter({
    attacks,
    context,
    flags: testFlags,
    guard: createWakeGuard(clock),
    jevLog,
    log,
    runs,
  });
  const sink = { human: jest.fn(), passive: jest.fn(), wake: jest.fn() };
  router.setSink(sink);
  return { jevRows, log, router, runs, sink };
}
