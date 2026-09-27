import type { RecoveryEvent } from "@tuicraft/core";
import type { LogDraft } from "#harness/contract/log";
import {
  type Drafts,
  guidText,
  type PoseMemo,
  type RuleInput,
  unitIds,
} from "#harness/events/rules";
import { poseMemo } from "#harness/events/rules-world";

const VIA: Partial<Record<RecoveryEvent["type"], string>> = {
  reclaim_requested: "corpse",
  resurrection_response_requested: "resurrection",
  spirit_healer_requested: "spirit_healer",
};
const VIA_TEXT: Record<string, string> = {
  corpse: "corpse reclaim",
  resurrection: "resurrection",
  spirit_healer: "spirit healer",
};

function named(guid: bigint, rc: RuleInput): string {
  return `${rc.lookup.unitName(guid) ?? "A unit"} ${rc.refOf(guid)}`;
}

function deathDraft(event: RecoveryEvent, rc: RuleInput): LogDraft {
  const killer = rc.lookup.lastAttacker();
  const by = killer === undefined ? "" : ` (last hit by ${named(killer, rc)})`;
  const data = {
    killer: killer === undefined ? undefined : guidText(killer),
    killerName: killer === undefined ? undefined : rc.lookup.unitName(killer),
    pose: event.state.reclaim.pose,
  };
  rc.memo.recovery = {
    corpse: poseMemo(event.state.reclaim.pose),
    via: undefined,
  };
  return {
    class: "wake",
    data,
    domain: "life",
    event: "life/dead",
    ...unitIds(killer, rc),
    text: `You died${by}.`,
  };
}

function yards(from: PoseMemo | undefined, to: PoseMemo | undefined) {
  if (!(from && to) || from.mapId !== to.mapId) return;
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return Math.round(d * 10) / 10;
}

function aliveDraft(
  event: RecoveryEvent,
  before: string,
  rc: RuleInput,
): LogDraft {
  const pose = poseMemo(event.state.reclaim.pose);
  const { corpse, via } = rc.memo.recovery;
  const corpseDistance = yards(pose, corpse);
  rc.memo.recovery = { corpse: undefined, via: undefined };
  const parts = [
    via === undefined ? undefined : VIA_TEXT[via],
    corpseDistance === undefined
      ? undefined
      : `${Math.round(corpseDistance)} yd from your corpse`,
  ].filter((part) => part !== undefined);
  const why = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return {
    class: "wake",
    data: { corpseDistance, from: before, pose, via },
    domain: "life",
    event: "life/alive",
    text: `You are alive again${why}.`,
  };
}

function lifeDrafts(event: RecoveryEvent, rc: RuleInput): Drafts {
  const { life, graveyard } = event.state;
  const before = rc.memo.life;
  rc.memo.life = life;
  if (life === before) return [];
  if (life === "dead") return [deathDraft(event, rc)];
  if (life === "ghost") {
    const text = "You released your spirit. You are a ghost at the graveyard.";
    return [
      {
        class: "wake",
        data: { graveyard },
        domain: "life",
        event: "life/released",
        text,
      },
    ];
  }
  if (life !== "alive" || (before !== "dead" && before !== "ghost")) return [];
  return [aliveDraft(event, before, rc)];
}

function noteRecovery(event: RecoveryEvent, rc: RuleInput): void {
  const { corpse, request } = event.state;
  if (event.type === "corpse_observed" && corpse.status === "found")
    rc.memo.recovery.corpse = {
      mapId: corpse.corpseMapId,
      ...corpse.position,
    };
  const via = VIA[event.type];
  const declined = request?.action === "resurrection" && !request.accept;
  if (via && !declined) rc.memo.recovery.via = via;
}

export function recoveryDrafts(event: RecoveryEvent, rc: RuleInput): Drafts {
  noteRecovery(event, rc);
  if (event.type === "life_observed") return lifeDrafts(event, rc);
  if (event.type !== "resurrection_offered") return [];
  const from = event.state.resurrection?.name;
  const text = `${from ?? "Someone"} offers to resurrect you.`;
  return [
    {
      class: "passive",
      data: { from },
      domain: "life",
      event: "life/resurrect_offer",
      text,
    },
  ];
}
