import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildMissileTrajectory,
  buildProjectilePosition,
} from "#wow/areas/spells/protocol";
import type { SpellsActResult, SpellsActs } from "#wow/areas/spells/runtime";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { Vec3 } from "#wow/protocol/packet";
import type { CoreStores } from "#wow/session-stores";

type MissileActFns = Pick<
  SpellsActs,
  "reportMissileTrajectory" | "reportProjectile"
>;

export type MissileTrajectory = {
  elevation: number;
  speed: number;
  current: Vec3;
  target: Vec3;
};

export function missileActs(
  ctx: AreaRuntimeCtx<SpellsEvent>,
  core: CoreStores,
): MissileActFns {
  const reportProjectile = (
    spellId: number,
    x: number,
    y: number,
    z: number,
  ): SpellsActResult => {
    const casting = core.combat.casts.casting;
    if (casting?.spellId !== spellId)
      return { ok: false, reason: "not_casting" };
    ctx.send(
      GameOpcode.CMSG_UPDATE_PROJECTILE_POSITION,
      buildProjectilePosition({
        castCount: casting.count,
        caster: ctx.selfGuid(),
        position: { x, y, z },
        spellId,
      }),
    );
    return { ok: true };
  };
  const reportMissileTrajectory = (
    spellId: number,
    trajectory: MissileTrajectory,
  ): SpellsActResult => {
    if (core.combat.casts.casting?.spellId !== spellId)
      return { ok: false, reason: "not_casting" };
    ctx.send(
      GameOpcode.CMSG_UPDATE_MISSILE_TRAJECTORY,
      buildMissileTrajectory({
        caster: ctx.selfGuid(),
        current: trajectory.current,
        elevation: trajectory.elevation,
        speed: trajectory.speed,
        spellId,
        target: trajectory.target,
      }),
    );
    return { ok: true };
  };
  return { reportMissileTrajectory, reportProjectile };
}
