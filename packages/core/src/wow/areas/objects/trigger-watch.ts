import type { AreaTrigger } from "#wow/areas/objects/trigger-catalog";

export type TriggerPoint = { mapId: number; x: number; y: number; z: number };
export type TriggersOn = (map: number) => readonly AreaTrigger[];

function inBox(t: AreaTrigger, p: TriggerPoint): boolean {
  const rotation = 2 * Math.PI - t.orientation;
  const sin = Math.sin(rotation);
  const cos = Math.cos(rotation);
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  return (
    Math.abs(dx * cos - dy * sin) <= t.length / 2 &&
    Math.abs(dy * cos + dx * sin) <= t.width / 2 &&
    Math.abs(p.z - t.z) <= t.height / 2
  );
}

export function insideTrigger(t: AreaTrigger, p: TriggerPoint): boolean {
  if (t.map !== p.mapId) return false;
  if (t.radius > 0)
    return Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z) <= t.radius;
  return inBox(t, p);
}

export class TriggerWatch {
  private readonly triggersOn: TriggersOn;
  private map: number | undefined;
  private holding = new Set<number>();

  constructor(triggersOn: TriggersOn) {
    this.triggersOn = triggersOn;
  }

  move(p: TriggerPoint, options: { taxi: boolean }): number[] {
    const before = this.map === p.mapId ? this.holding : new Set<number>();
    this.track(p);
    if (options.taxi) return [];
    return [...this.holding].filter((id) => !before.has(id));
  }

  arrive(p: TriggerPoint): void {
    this.track(p);
  }

  inside(): readonly number[] {
    return [...this.holding];
  }

  private track(p: TriggerPoint): void {
    this.map = p.mapId;
    this.holding = new Set(
      this.triggersOn(p.mapId)
        .filter((t) => insideTrigger(t, p))
        .map((t) => t.id),
    );
  }
}
