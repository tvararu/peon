import type {
  HarnessFlags,
  Profile,
  RunMeta,
  RunPaths,
} from "#harness/contract/config";
import type {
  Clock,
  HarnessRuntime,
  QuestMemory,
  TravelMemory,
} from "#harness/contract/services";
import { createToolStats } from "#harness/eval/stats";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import type { RuleContext } from "#harness/events/rules";
import { createWorldSnapshots } from "#harness/events/snapshot";
import type { PacketTrace } from "#harness/log/packet-trace";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createProgressTracker } from "#harness/ops/progress";
import { createRefTable } from "#harness/ops/refs";
import { pinnedBy } from "#harness/ops/remembered";
import { createRepeatGuard } from "#harness/ops/repeat-guard";
import { createSightings } from "#harness/ops/sightings";
import { snapshotWorld } from "#harness/ops/views";
import { createRunRegistry } from "#harness/runs/registry";
import { defaultLogin } from "#harness/runtime/connection";
import { createHarnessRuntime } from "#harness/runtime/harness-runtime";
import { createWorldMutex } from "#harness/runtime/mutex";
import { createReadyGate } from "#harness/runtime/ready";
import { createYieldGate } from "#harness/runtime/yield";
import type { GlyphSetName } from "#harness/ui/glyphs";
export function composeRuntime({
  flags,
  paths,
  profile,
  trace,
}: {
  flags: HarnessFlags;
  paths: RunPaths;
  profile: Profile;
  trace: PacketTrace;
}): HarnessRuntime {
  const clock: Clock = { now: () => Date.now() };
  const log = createGameLog({
    char: () => profile.character,
    clock,
    file: paths.gamelog,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: paths.runs }),
  });
  const attacks = createAttackLedger(clock);
  const jevLog = createJsonlSink({ file: paths.jev });
  const late: { rt?: HarnessRuntime } = {};
  const router = createEventRouter({
    attacks,
    context: () => ruleContext(built(late.rt)),
    flags,
    guard: createWakeGuard(clock),
    jevLog,
    log,
    runs,
  });
  const snapshots = createWorldSnapshots({
    clock,
    log,
    paths,
    world: () => snapshotWorld(built(late.rt)),
  });
  const quests: QuestMemory = new Map();
  const shared = {
    attacks,
    clock,
    flags,
    jevLog,
    log,
    login: (player: Profile) => defaultLogin(player, trace),
    paths,
    profile,
    quests,
    router,
    runs,
    snapshots,
    travel: travelMemory(),
  };
  late.rt = createHarnessRuntime({
    ...shared,
    ...services({ clock, log, profile, quests }),
  });
  return late.rt;
}

export function runMeta({
  flags,
  glyphs,
  model,
  profile,
  startedAt,
}: {
  flags: HarnessFlags;
  glyphs: GlyphSetName;
  model: string;
  profile: Profile;
  startedAt: number;
}): RunMeta {
  const files = {
    gamelog: "gamelog.jsonl",
    jev: "jev.jsonl",
    packetCounts: "packets.json",
    packets: "packets.jsonl",
    runs: "runs.jsonl",
    session: "session.jsonl",
    status: "status.json",
    tools: "tools.json",
  };
  const run = {
    capabilities: undefined,
    characterGuid: undefined,
    endedAt: undefined,
    exitReason: undefined,
    gitSha: gitSha(),
    startedAt,
  };
  return {
    ...run,
    account: profile.account,
    character: profile.character,
    files,
    flags,
    glyphs,
    model,
    thinking: flags.thinking,
    v: 1,
  };
}

function travelMemory(): TravelMemory {
  return {
    blockedBearings: new Map(),
    exploreOrigin: undefined,
    explores: [],
    lastGoodPose: undefined,
    lastRefusedGoal: undefined,
    obstructedExplores: new Map(),
    recovery: undefined,
    triggers: undefined,
    visitedCells: new Set<string>(),
  };
}

function services({
  clock,
  log,
  profile,
  quests,
}: {
  clock: Clock;
  log: ReturnType<typeof createGameLog>;
  profile: Profile;
  quests: QuestMemory;
}) {
  return {
    mutex: createWorldMutex(),
    progress: createProgressTracker({ clock, log }),
    ready: createReadyGate({ clock, log, profile }),
    refs: createRefTable(),
    repeats: createRepeatGuard(clock),
    sightings: createSightings(clock, pinnedBy(quests)),
    stats: createToolStats(clock),
    yields: createYieldGate(),
  };
}

function built(rt: HarnessRuntime | undefined): HarnessRuntime {
  if (!rt) throw new Error("The harness runtime is not built yet.");
  return rt;
}

function ruleContext(rt: HarnessRuntime): RuleContext {
  const selfGuid = rt.handle()?.getControlState().selfGuid ?? 0n;
  return {
    now: rt.clock.now(),
    refOf: (guid) => rt.refs.refOf(guid),
    runActive: rt.runs.active() !== undefined,
    selfGuid,
    selfName: rt.profile.character,
    wake: rt.session.wake,
  };
}

function gitSha(): string | undefined {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: import.meta.dir,
    stderr: "ignore",
  });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
}
