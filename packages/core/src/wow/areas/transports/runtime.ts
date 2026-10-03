import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  type LiftModel,
  liftPoseAt,
  liftProgressAt,
  readLiftAnimations,
  TRANSPORT_ANIMATION_LAYOUT,
  TRANSPORT_ROTATION_LAYOUT,
} from "#wow/areas/transports/lift";
import {
  generateTransportPath,
  readTaxiPaths,
  TAXI_PATH_NODE_LAYOUT,
  type TaxiNode,
  type TransportPath,
  type TransportPose,
} from "#wow/areas/transports/path";
import type {
  LiftStepper,
  TransportsEvent,
  TransportsStore,
} from "#wow/areas/transports/store";
import { openDbc } from "#wow/dbc";
import type { CoreStores } from "#wow/session-stores";

export type TransportsOutcome =
  | { status: "ok" }
  | {
      status: "refused";
      reason:
        | "transport_data_missing"
        | "not_docked"
        | "too_far"
        | "not_boarded"
        | "ground_height_unavailable";
    };

export type TransportsActs = {
  dataStatus: () => string;
  poseAt: (guid: bigint, offsetMs?: number) => TransportPose | undefined;
  board: (guid: bigint) => Promise<TransportsOutcome> | TransportsOutcome;
  leave: () => Promise<TransportsOutcome> | TransportsOutcome;
};

type Models = {
  paths: ReadonlyMap<number, TaxiNode[]>;
  anims: ReadonlyMap<number, LiftModel>;
  generated: Map<number, TransportPath | undefined>;
};

function modelsOf(models: Models | undefined): Models | undefined {
  return models;
}

function motionPose(
  models: Models,
  store: TransportsStore,
  guid: bigint,
  now: number,
): TransportPose | undefined {
  const entry = store.snapshot().transports.get(guid);
  if (entry?.kind !== "motion") return undefined;
  const template = store.snapshot().templates.get(entry.entry);
  if (!template || template.taxiPathId === 0) return undefined;
  const nodes = models.paths.get(template.taxiPathId);
  if (!nodes) return undefined;
  const key =
    template.taxiPathId * 1_000_000 +
    template.moveSpeed * 1000 +
    template.accelRate;
  let path = models.generated.get(key);
  if (path === undefined && !models.generated.has(key)) {
    path =
      generateTransportPath(nodes, template.moveSpeed, template.accelRate) ??
      undefined;
    models.generated.set(key, path);
  }
  if (!path) return undefined;
  const elapsed = (entry.pathProgress + (now - entry.receivedAt)) >>> 0;
  return path.poseAt(elapsed);
}

function liftPose(
  models: Models,
  store: TransportsStore,
  guid: bigint,
  now: number,
): TransportPose | undefined {
  const entry = store.snapshot().transports.get(guid);
  if (entry?.kind !== "lift" || entry.changes.length > 0) return undefined;
  const anim = models.anims.get(entry.entry);
  const template = store.snapshot().templates.get(entry.entry);
  if (!(anim && template) || anim.totalTime <= 0) return undefined;
  const progress = liftProgressAt({
    elapsed: Math.max(0, now - entry.receivedAt),
    goState: entry.goState,
    pauseAtTime: template.pauseAtTime,
    period: anim.totalTime,
    progress: entry.pathProgress,
  });
  const at = liftPoseAt(
    anim,
    progress.progress,
    entry.pose,
    entry.pathRotation,
  );
  if (!at) return undefined;
  return {
    mapId: entry.mapId,
    x: at.x,
    y: at.y,
    z: at.z,
    orientation: at.orientation,
    moving: !progress.held,
  };
}

function liftStepper(models: Models, store: TransportsStore): LiftStepper {
  return (entry, goState, progress, elapsed) => {
    const anim = models.anims.get(entry);
    const template = store.snapshot().templates.get(entry);
    if (!(anim && template) || anim.totalTime <= 0) return;
    return liftProgressAt({
      elapsed,
      goState,
      pauseAtTime: template.pauseAtTime,
      period: anim.totalTime,
      progress,
    }).progress;
  };
}

async function loadModels(
  ctx: AreaRuntimeCtx<TransportsEvent>,
  store: TransportsStore,
): Promise<Models | undefined> {
  if (!ctx.dbc) {
    store.setMissing();
    return undefined;
  }
  const paths = readTaxiPaths(await openDbc(ctx.dbc, TAXI_PATH_NODE_LAYOUT));
  const anims = await readLiftAnimations(
    ctx.dbc,
    TRANSPORT_ANIMATION_LAYOUT,
    TRANSPORT_ROTATION_LAYOUT,
  );
  if (ctx.signal.aborted) return undefined;
  store.setData({ anims, paths });
  const loaded: Models = { anims, generated: new Map(), paths };
  store.setStepper(liftStepper(loaded, store));
  return loaded;
}

type Refusal = Extract<TransportsOutcome, { status: "refused" }>["reason"];

const REFUSALS: readonly Refusal[] = [
  "transport_data_missing",
  "not_docked",
  "too_far",
  "not_boarded",
  "ground_height_unavailable",
];

type RideDeps = {
  store: TransportsStore;
  core: CoreStores;
  at: (guid: bigint) => TransportPose | undefined;
};

function refuse(error: unknown): TransportsOutcome {
  const reason = REFUSALS.find(
    (known) => error instanceof Error && error.message === known,
  );
  if (!reason) throw error;
  return { status: "refused", reason };
}

function boardTransport(
  { store, core, at }: RideDeps,
  guid: bigint,
): TransportsOutcome {
  const pose = at(guid);
  if (!pose) return { reason: "transport_data_missing", status: "refused" };
  if (pose.moving) return { reason: "not_docked", status: "refused" };
  try {
    core.self.receive({
      guid,
      poseAt: () => at(guid),
      type: "transport_board",
    });
  } catch (error) {
    return refuse(error);
  }
  store.emitBoarded(guid, store.snapshot().transports.get(guid)?.entry ?? 0);
  return { status: "ok" };
}

function leaveTransport({ store, core }: RideDeps): TransportsOutcome {
  const guid = store.boardedGuid();
  try {
    core.self.receive({ type: "transport_leave" });
  } catch (error) {
    return refuse(error);
  }
  if (guid !== undefined) store.emitLeft(guid);
  return { status: "ok" };
}

export function transportsRuntime(
  ctx: AreaRuntimeCtx<TransportsEvent>,
  store: TransportsStore,
  core: CoreStores,
): AreaRuntime<TransportsActs> {
  let models: Models | undefined;
  loadModels(ctx, store)
    .then((loaded) => {
      models = modelsOf(loaded);
    })
    .catch(ignoreFailure);
  const at = (guid: bigint, offsetMs = 0): TransportPose | undefined => {
    if (!models) return undefined;
    const now = ctx.now() + offsetMs;
    return (
      motionPose(models, store, guid, now) ?? liftPose(models, store, guid, now)
    );
  };
  const off = core.self.onEvent((event) => {
    if (event.type !== "transfer_pending" || !event.transport) return;
    store.emitMapChange({
      entry: event.transport.entry,
      fromMap: event.transport.fromMap,
      toMap: event.mapId,
    });
  });
  return {
    act: {
      dataStatus: () => store.snapshot().data.status,
      poseAt: at,
      board: (guid) => boardTransport({ at, core, store }, guid),
      leave: () => leaveTransport({ at, core, store }),
    },
    dispose: () => {
      off();
      models = undefined;
    },
  };
}
