import {
  type LootMethod,
  type LootThreshold,
  needGroup,
  resolveMember,
  runRaidSettled,
} from "#harness/areas/raid/tool-settle";
import {
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  type GroupDo,
  isLeader,
  type RaidGroup,
  sameName,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";

const LOOT_METHOD_INDEX: Record<LootMethod, number> = {
  free_for_all: 0,
  group_loot: 3,
  master_loot: 2,
  need_before_greed: 4,
  round_robin: 1,
};
const LOOT_QUALITY_INDEX: Record<LootThreshold, number> = {
  artifact: 6,
  epic: 4,
  legendary: 5,
  rare: 3,
  uncommon: 2,
};
const SELF_MASTER = "@self";

type Rules = {
  master: string;
  method: LootMethod;
  threshold: LootThreshold;
};

function pick<T extends string>(
  table: Record<T, number>,
  value: string | undefined,
): T | undefined {
  const name = value?.trim().toLowerCase();
  return name && Object.hasOwn(table, name) ? (name as T) : undefined;
}

function refuse(reason: string, detail: string): never {
  throw new Refusal({ detail, next: "end your turn.", reason });
}

function thresholdName(index: number): LootThreshold {
  const names = Object.keys(LOOT_QUALITY_INDEX) as LootThreshold[];
  return names.find((name) => LOOT_QUALITY_INDEX[name] === index) ?? "uncommon";
}

function needLeader(group: RaidGroup, ctx: GroupCtx): void {
  if (!isLeader(group, ctx))
    refuse("not_leader", "only the leader sets the loot rules.");
  if (group.dungeonFinder !== undefined)
    refuse("lfg_group", "the dungeon finder runs this group's loot.");
}

function masterFor(
  args: GroupArgs,
  method: LootMethod,
  members: Parameters<typeof resolveMember>[0],
): string {
  const named = args.to?.trim() ?? "";
  if (named !== "") return resolveMember(members, named).name;
  return method === "master_loot" ? SELF_MASTER : "";
}

function masterGuid(
  master: string,
  ctx: GroupCtx,
  members: Parameters<typeof resolveMember>[0],
): bigint {
  if (master === SELF_MASTER) return ctx.handle.getControlState().selfGuid;
  if (master === "") return 0n;
  return members.find((member) => sameName(member.name, master))?.guid ?? 0n;
}

function parseRules(
  args: GroupArgs,
  group: RaidGroup,
  members: Parameters<typeof resolveMember>[0],
): Rules {
  const method =
    pick(LOOT_METHOD_INDEX, args.what) ?? pick(LOOT_METHOD_INDEX, args.text);
  if (!method)
    refuse(
      "bad_loot_method",
      "loot_rules reads the method from what: free_for_all, round_robin, master_loot, group_loot or need_before_greed.",
    );
  const quality = args.quality?.trim();
  const named = quality ? pick(LOOT_QUALITY_INDEX, quality) : undefined;
  if (quality && !named)
    refuse(
      "bad_loot_quality",
      "name a quality: uncommon, rare, epic, legendary or artifact.",
    );
  const threshold =
    named ?? (group.loot ? thresholdName(group.loot.threshold) : "uncommon");
  return { master: masterFor(args, method, members), method, threshold };
}

function inForce(rules: Rules, group: RaidGroup, master: bigint): boolean {
  const current = group.loot;
  return (
    current !== undefined &&
    LOOT_METHOD_INDEX[rules.method] === current.method &&
    LOOT_QUALITY_INDEX[rules.threshold] === current.threshold &&
    master === current.master
  );
}

function lootAfter(to: string | undefined, confirmed: boolean): GroupAfter {
  return {
    ...emptyGroup(),
    confirmed,
    do: "loot_rules" as GroupDo,
    member: to,
    to,
  };
}

export async function lootRulesTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group, party } = needGroup(ctx);
  needLeader(group, ctx);
  const rules = parseRules(args, group, party.members);
  const { master, method, threshold } = rules;
  if (inForce(rules, group, masterGuid(master, ctx, party.members))) {
    return result("DONE", {
      after: { ...lootAfter(undefined, true), member: undefined },
      detail: `loot is already ${method}, ${threshold}.`,
    });
  }
  const to = master === SELF_MASTER || master === "" ? undefined : master;
  return await runRaidSettled(
    ctx,
    () => ctx.handle.looting.act.setLootMethod(rules),
    (answer) => {
      if (
        answer?.kind === "raid" &&
        answer.event.type === "group_list" &&
        answer.event.changes.some((change) => change.kind === "loot")
      ) {
        return {
          after: lootAfter(to, true),
          detail: `loot is ${method}, ${threshold}.`,
          status: "DONE",
        };
      }
    },
    {
      after: lootAfter(to, false),
      detail: "the loot change is not confirmed yet.",
      failedDetail: "the loot change failed.",
      next: "end your turn; a [game] message comes if the loot rules change.",
    },
  );
}
