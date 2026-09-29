import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildMinimapPing,
  buildRaidTargetRequest,
  buildRaidTargetUpdate,
} from "#wow/areas/raid/protocol-marks";
import { MARK_COUNT } from "#wow/areas/raid/store-marks";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

export type MarkActs = {
  setRaidMark: (icon: number, guid: bigint) => void;
  clearRaidMark: (icon: number) => void;
  requestRaidMarks: () => void;
  pingMinimap: (x: number, y: number) => void;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;

function checkIcon(icon: number): void {
  if (!Number.isInteger(icon) || icon < 0 || icon >= MARK_COUNT)
    throw new Error(`icon must be 0-${MARK_COUNT - 1}`);
}

export function composeMarksRuntime(env: { ctx: Ctx }): {
  act: MarkActs;
  dispose: () => void;
} {
  function setRaidMark(icon: number, guid: bigint): void {
    checkIcon(icon);
    env.ctx.send(
      GameOpcode.MSG_RAID_TARGET_UPDATE,
      buildRaidTargetUpdate(icon, guid),
    );
  }
  function clearRaidMark(icon: number): void {
    setRaidMark(icon, 0n);
  }
  function requestRaidMarks(): void {
    env.ctx.send(GameOpcode.MSG_RAID_TARGET_UPDATE, buildRaidTargetRequest());
  }
  function pingMinimap(x: number, y: number): void {
    env.ctx.send(GameOpcode.MSG_MINIMAP_PING, buildMinimapPing(x, y));
  }
  return {
    act: { clearRaidMark, pingMinimap, requestRaidMarks, setRaidMark },
    dispose: () => undefined,
  };
}
