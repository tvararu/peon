import { homedir } from "node:os";
import {
  type AgentSessionRuntime,
  type ExtensionFactory,
  InteractiveMode,
  initTheme,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { messageOf } from "@peon/core/lib/errors";
import { harnessStateDir } from "#harness/config/flags";
import { acquireLock, type Lock, LockError } from "#harness/config/lock";
import {
  loadProfile,
  ProfileError,
  readableExtensions,
} from "#harness/config/profile";
import type {
  HarnessFlags,
  Profile,
  RunMeta,
  RunPaths,
} from "#harness/contract/config";
import type { HarnessRuntime } from "#harness/contract/services";
import {
  chooseModel,
  FALLBACK_MODEL,
  findLogins,
  NO_LOGIN,
  peonAuthPath,
  startupLine,
} from "#harness/credentials/status";
import { driveExtension } from "#harness/drive/extension";
import {
  createRunDir,
  finalizeSession,
  linkSession,
  RunDirError,
  runsRoot,
  writeMeta,
  writeMetaSync,
} from "#harness/eval/run-dir";
import { STATS_EVERY_MS } from "#harness/eval/stats";
import {
  createStatusWriter,
  STATUS_EVERY_MS,
  type StatusWriter,
  statusSnapshot,
} from "#harness/eval/status";
import { wowExtension } from "#harness/extension/extension";
import { createPacketTrace, type PacketTrace } from "#harness/log/packet-trace";
import { composeRuntime, runMeta } from "#harness/runtime/compose";
import { missingDbcWarnings } from "#harness/runtime/dbc-check";
import {
  createExitRecorder,
  type ExitProcess,
  type ExitRecorder,
} from "#harness/runtime/exit";
import { createPiRuntime, splitModel } from "#harness/runtime/pi-runtime";
import { setGlyphs } from "#harness/ui/context";
import { resolveGlyphSet } from "#harness/ui/glyphs";
import { worldExtension } from "#harness/world/extension";

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
  models: ModelRuntime;
  model: string;
  extensionPaths: string[];
};
type Finish = {
  rt: HarnessRuntime;
  trace: PacketTrace;
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
  const extensionPaths = await readableExtensions(profile, flags);
  const lock = await acquireLock({
    profile,
    runDir: flags.runDir ?? runsRoot(deps.home),
    stateDir: harnessStateDir(deps.home),
  });
  deps.proc.on("exit", lock.releaseSync);
  const models = await ModelRuntime.create({
    authPath: peonAuthPath(deps.home),
    modelsPath: null,
    refreshOnCreate: false,
  });
  await warnDbc(profile, deps);
  const logins = await findLogins(models);
  const chosen = chooseModel({ explicit: flags.model, logins });
  const model = chosen ?? flags.model ?? FALLBACK_MODEL;
  if (flags.model) splitModel(flags.model);
  if (chosen) deps.out(startupLine(logins, chosen));
  else deps.err(NO_LOGIN);
  if (flags.check) {
    await lock.release();
    return chosen ? EXIT.ok : EXIT.credential;
  }
  await play({ deps, extensionPaths, flags, lock, model, models, profile });
  return EXIT.ok;
}

async function warnDbc(profile: Profile, deps: MainDeps): Promise<void> {
  if (profile.spellDataDir)
    for (const warning of await missingDbcWarnings(profile.spellDataDir))
      deps.err(warning);
}

async function play({
  flags,
  deps,
  profile,
  lock,
  models,
  model,
  extensionPaths,
}: Started): Promise<void> {
  const opened = await openRun({ deps, flags, lock, model, profile });
  const { exit, finish, paths, rt } = opened;
  const piRuntime = await openedPi({
    deps,
    exit,
    extensionPaths,
    finish,
    model,
    models,
    rt,
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

type Opened = {
  paths: RunPaths;
  trace: PacketTrace;
  rt: HarnessRuntime;
  meta: RunMeta;
  exit: ExitRecorder;
  status: StatusWriter;
  finish: () => Promise<void>;
};

async function openRun({
  deps,
  flags,
  lock,
  model,
  profile,
}: Omit<Started, "extensionPaths" | "models">): Promise<Opened> {
  const paths = await createRunDir({
    character: profile.character,
    flag: flags.runDir,
    home: deps.home,
    now: new Date(deps.now()),
  });
  const trace = createPacketTrace({ mode: flags.packetTrace, paths });
  const rt = composeRuntime({ flags, paths, profile, trace });
  const glyphs = resolveGlyphSet(
    flags.glyphs,
    Bun.env["PEON_GLYPHS"],
    deps.err,
  );
  setGlyphs(glyphs);
  const meta = runMeta({
    flags,
    glyphs,
    model,
    profile,
    startedAt: deps.now(),
  });
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
  const finish = finisher({ exit, lock, paths, rt, status, trace });
  return { exit, finish, meta, paths, rt, status, trace };
}

async function openedPi({
  deps,
  exit,
  extensionPaths,
  finish,
  model,
  models,
  rt,
}: {
  deps: MainDeps;
  exit: ExitRecorder;
  extensionPaths: readonly string[];
  finish: () => Promise<void>;
  model: string;
  models: ModelRuntime;
  rt: HarnessRuntime;
}): Promise<AgentSessionRuntime> {
  const agentDir = `${harnessStateDir(deps.home)}/agent`;
  const piRuntime = await createPiRuntime({
    agentDir,
    extensionPaths: [...extensionPaths],
    extensions: [
      { factory: worldExtension(rt), name: "world" },
      { factory: driveExtension(), name: "drive" },
      { factory: withFinish(wowExtension(rt), exit, finish), name: "wow" },
    ],
    model,
    models,
    runtime: rt,
  });
  return piRuntime;
}

function finisher({
  rt,
  paths,
  exit,
  status,
  lock,
  trace,
}: Finish): () => Promise<void> {
  return async () => {
    await status.stop();
    await trace.flush();
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
