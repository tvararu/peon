import type { WorldHandle } from "#wow/client";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

export type Capabilities = {
  factions: boolean;
  spells: boolean;
};

export type NoticeEvent = {
  type: "not_implemented";
  opcode: number;
  label: string;
  text: string;
  at: number;
};

export type CreatureRank = "normal" | "elite" | "rare_elite" | "boss" | "rare";

export type CreatureInfo = {
  entry: number;
  name: string;
  subName: string | undefined;
  creatureType: number;
  family: number;
  rank: CreatureRank;
};

type Extras = Pick<
  WorldHandle,
  "capabilities" | "onNotice" | "getCreatureInfo"
>;

export function extrasMethods(conn: WorldConn, rt: Runtimes): Extras {
  return {
    capabilities() {
      return rt.capabilities();
    },
    onNotice(cb) {
      const off = conn.events.notice.subscribe(cb);
      for (const event of conn.pendingNotices.splice(0)) cb(event);
      return off;
    },
    getCreatureInfo(entry) {
      return conn.creatureInfoCache.get(entry);
    },
  };
}
