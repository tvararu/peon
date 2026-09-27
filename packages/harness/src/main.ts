import { homedir } from "node:os";
import type { CredentialStore } from "@earendil-works/pi-ai";
import {
  type AgentSessionRuntime,
  type ExtensionFactory,
  InteractiveMode,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import { messageOf } from "@tuicraft/core/lib/errors";
import { harnessStateDir } from "#harness/config/flags";
import { acquireLock, type Lock, LockError } from "#harness/config/lock";
import { loadProfile, ProfileError } from "#harness/config/profile";
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
import { OmpCredentialStore, ompDbPath } from "#harness/credentials/omp-store";
import { credentialStatus, startupCheck } from "#harness/credentials/status";
import {
  createRunDir,
  finalizeSession,
  linkSession,
  RunDirError,
  runsRoot,
  writeMeta,
  writeMetaSync,
} from "#harness/eval/run-dir";
import { createToolStats, STATS_EVERY_MS } from "#harness/eval/stats";
import {
  createStatusWriter,
  STATUS_EVERY_MS,
  type StatusWriter,
  statusSnapshot,
} from "#harness/eval/status";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import type { RuleContext } from "#harness/events/rules";
import { createWorldSnapshots } from "#harness/events/snapshot";
import { wowExtension } from "#harness/extension/extension";
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
import {
  createExitRecorder,
  type ExitProcess,
  type ExitRecorder,
} from "#harness/runtime/exit";
import { createHarnessRuntime } from "#harness/runtime/harness-runtime";
import { createWorldMutex } from "#harness/runtime/mutex";
import { createPiRuntime } from "#harness/runtime/pi-runtime";
import { createReadyGate } from "#harness/runtime/ready";
import { createYieldGate } from "#harness/runtime/yield";
import { setGlyphs } from "#harness/ui/context";
import { type GlyphSetName, resolveGlyphSet } from "#harness/ui/glyphs";

export const EXIT = { credential: 3, ok: 0, refused: 2, usage: 2 } as const;

export type MainDeps = {
  home: string;
  now: () => number;
  out: (line: string) => void;
  err: (line: string) => void;
  interactive: (runtime: AgentSessionRuntime) => Promise<void>;
  proc: ExitProcess;
};

type Started = {
  flags: HarnessFlags;
  deps: MainDeps;
  profile: Profile;
  lock: Lock;
  credentials: CredentialStore;
};
type Finish = {
  rt: HarnessRuntime;
  paths: RunPaths;
  exit: ExitRecorder;
  status: StatusWriter;
  lock: Lock;
};

export async function main(
  flags: HarnessFlags,
  deps: MainDeps = defaultDeps(),
): Promise<number> {
  try {
    return await start(flags, deps);
  } catch (error) {
    if (
      !(
        error instanceof ProfileError ||
        error instanceof LockError ||
        error instanceof RunDirError
      )
    )
      throw error;
    deps.err(error.message);
    return EXIT.refused;
  }
}

function defaultDeps(): MainDeps {
  return {
    err: (line) => console.error(line),
    home: homedir(),
    interactive: runInteractive,
    now: () => Date.now(),
    out: (line) => console.log(line),
    proc: process,
  };
}

async function start(flags: HarnessFlags, deps: MainDeps): Promise<number> {
  const profile = await loadProfile(flags.profile, deps.home);
  const lock = await acquireLock({
    profile,
    runDir: flags.runDir ?? runsRoot(deps.home),
    stateDir: harnessStateDir(deps.home),
  });
  deps.proc.on("exit", lock.releaseSync);
  const credentials = new OmpCredentialStore({
    dbPath: ompDbPath(deps.home),
    now: deps.now,
  });
  const check = startupCheck(await credentialStatus(credentials, deps.now()));
  if (check.ok) deps.out(check.line);
  else deps.err(check.line);
  if (!check.ok || flags.check) {
    await lock.release();
    return check.ok ? EXIT.ok : EXIT.credential;
  }
  await play({ credentials, deps, flags, lock, profile });
  return EXIT.ok;
}

async function play({
  flags,
  deps,
  profile,
  lock,
  credentials,
}: Started): Promise<void> {
  const paths = await createRunDir({
    character: profile.character,
    flag: flags.runDir,
    home: deps.home,
    now: new Date(deps.now()),
  });
  const rt = composeRuntime({ flags, paths, profile });
  const glyphs = resolveGlyphSet(
    flags.glyphs,
    Bun.env["TUICRAFT_GLYPHS"],
    deps.err,
  );
  setGlyphs(glyphs);
  const meta = runMeta({ flags, glyphs, profile, startedAt: deps.now() });
  await writeMeta(paths, meta);
  const exit = createExitRecorder({
    meta,
    notice: deps.out,
    now: deps.now,
    proc: deps.proc,
    write: (value) => writeMeta(paths, value),
    writeSync: (value) => writeMetaSync(paths, value),
  });
  rt.stats.start({ everyMs: STATS_EVERY_MS, path: paths.tools });
  const status = createStatusWriter({
    path: paths.status,
    snapshot: () => statusSnapshot(rt),
  });
  status.start(STATUS_EVERY_MS);
  const finish = finisher({ exit, lock, paths, rt, status });
  const agentDir = `${harnessStateDir(deps.home)}/agent`;
  const piRuntime = await createPiRuntime({
    agentDir,
    credentials,
    extension: withFinish(wowExtension(rt), exit, finish),
    runtime: rt,
  });
  await linkSession(
    paths,
    piRuntime.session.sessionManager.getSessionFile() ?? paths.session,
  );
  if (flags.connect)
    rt.connect().catch((error: unknown) =>
      deps.err(
        `The harness could not connect: ${messageOf(error)}. Use /connect to try again.`,
      ),
    );
  exit.piOwnsSignals();
  await deps.interactive(piRuntime);
}

function composeRuntime({
  flags,
  paths,
  profile,
}: {
  flags: HarnessFlags;
  paths: RunPaths;
  profile: Profile;
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
    login: defaultLogin,
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

function travelMemory(): TravelMemory {
  return {
    blockedBearings: new Map(),
    exploreOrigin: undefined,
    explores: [],
    lastGoodPose: undefined,
    lastRefusedGoal: undefined,
    obstructedExplores: new Map(),
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

function runMeta({
  flags,
  glyphs,
  profile,
  startedAt,
}: {
  flags: HarnessFlags;
  glyphs: GlyphSetName;
  profile: Profile;
  startedAt: number;
}): RunMeta {
  const files = {
    gamelog: "gamelog.jsonl",
    jev: "jev.jsonl",
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
    model: flags.model,
    thinking: flags.thinking,
    v: 1,
  };
}

function gitSha(): string | undefined {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: import.meta.dir,
    stderr: "ignore",
  });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
}

function finisher({
  rt,
  paths,
  exit,
  status,
  lock,
}: Finish): () => Promise<void> {
  return async () => {
    await status.stop();
    const world = rt.ready.inWorld();
    await exit.end({
      capabilities: world?.capabilities,
      characterGuid: world?.guid,
    });
    await finalizeSession(paths);
    await lock.release();
  };
}

function withFinish(
  factory: ExtensionFactory,
  exit: ExitRecorder,
  finish: () => Promise<void>,
): ExtensionFactory {
  return async (pi) => {
    pi.on("session_shutdown", async ({ reason }) => {
      if (reason === "quit") await exit.begin();
    });
    await factory(pi);
    pi.on("session_shutdown", async ({ reason }) => {
      if (reason === "quit") await finish();
    });
  };
}

async function runInteractive(runtime: AgentSessionRuntime): Promise<void> {
  initTheme(runtime.services.settingsManager.getTheme(), false);
  const mode = new InteractiveMode(runtime, {
    modelFallbackMessage: runtime.modelFallbackMessage,
    startupDiagnostics: [...runtime.diagnostics],
  });
  await mode.run();
}
