import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  type LiftModel,
  liftPoseAt,
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
  TransportsEvent,
  TransportsStore,
} from "#wow/areas/transports/store";
import { openDbc } from "#wow/dbc";

export type TransportsActs = {
  dataStatus: () => string;
  poseAt: (guid: bigint) => TransportPose | undefined;
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
  const elapsed = entry.pathProgress + (now - entry.receivedAt);
  return path.poseAt(elapsed);
}

function liftPose(
  models: Models,
  store: TransportsStore,
  guid: bigint,
  now: number,
): TransportPose | undefined {
  const entry = store.snapshot().transports.get(guid);
  if (entry?.kind !== "lift") return undefined;
  const anim = models.anims.get(entry.entry);
  if (!anim) return undefined;
  const elapsed = entry.pathProgress + (now - entry.receivedAt);
  const at = liftPoseAt(anim, elapsed, entry.pose, entry.pathRotation);
  if (!at) return undefined;
  return {
    mapId: entry.mapId,
    x: at.x,
    y: at.y,
    z: at.z,
    orientation: at.orientation,
    moving: true,
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
  return { anims, paths, generated: new Map() };
}

export function transportsRuntime(
  ctx: AreaRuntimeCtx<TransportsEvent>,
  store: TransportsStore,
): AreaRuntime<TransportsActs> {
  let models: Models | undefined;
  loadModels(ctx, store)
    .then((loaded) => {
      models = modelsOf(loaded);
    })
    .catch(ignoreFailure);
  return {
    act: {
      dataStatus: () => store.snapshot().data.status,
      poseAt: (guid) => {
        if (!models) return;
        return (
          motionPose(models, store, guid, ctx.now()) ??
          liftPose(models, store, guid, ctx.now())
        );
      },
    },
    dispose: () => {
      models = undefined;
    },
  };
}
