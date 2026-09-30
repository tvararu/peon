import type { SummonRequest } from "#wow/areas/raid/protocol-summon";

export type Summon = {
  summoner: bigint;
  name: string;
  zoneId: number;
  zoneName: string | undefined;
  expiresAt: number;
};

export type SummonEvent =
  | {
      type: "summon_requested";
      summoner: bigint;
      name: string;
      zoneId: number;
      zoneName: string | undefined;
      expiresAt: number;
      timeoutMs: number;
    }
  | { type: "summon_expired"; summoner: bigint; name: string };

export class SummonStore {
  private summon: Summon | undefined;

  current(): Summon | undefined {
    return this.summon;
  }

  receive(
    packet: SummonRequest,
    now: number,
    name: string,
    zoneName?: string,
  ): SummonEvent {
    const expiresAt = now + packet.timeoutMs;
    this.summon = {
      expiresAt,
      name,
      summoner: packet.summoner,
      zoneId: packet.zoneId,
      zoneName,
    };
    return {
      expiresAt,
      name,
      summoner: packet.summoner,
      timeoutMs: packet.timeoutMs,
      type: "summon_requested",
      zoneId: packet.zoneId,
      zoneName,
    };
  }

  expire(expiresAt: number): SummonEvent | undefined {
    const summon = this.summon;
    if (!summon || summon.expiresAt !== expiresAt) return undefined;
    this.summon = undefined;
    return {
      name: summon.name,
      summoner: summon.summoner,
      type: "summon_expired",
    };
  }

  clear(): void {
    this.summon = undefined;
  }
}
