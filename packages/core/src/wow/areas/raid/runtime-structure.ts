import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildGroupAssistantLeader,
  buildGroupChangeSubGroup,
  buildGroupRaidConvert,
  buildGroupSwapSubGroup,
  buildGroupUninviteGuid,
  buildPartyAssignment,
  PARTY_ASSIGN_MAIN_ASSIST,
  PARTY_ASSIGN_MAIN_TANK,
} from "#wow/areas/raid/protocol-structure";
import type { RaidEvent, RaidState } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

export type StructureActs = {
  convertToRaid: () => void;
  moveToSubgroup: (name: string, group: number) => void;
  swapSubgroups: (name: string, withName: string) => void;
  setAssistant: (name: string, on: boolean) => void;
  setMainTank: (name: string, on: boolean) => void;
  setMainAssist: (name: string, on: boolean) => void;
  uninviteGuid: (name: string, reason: string) => void;
};

type Ctx = AreaRuntimeCtx<RaidEvent>;
type Store = {
  snapshot: () => RaidState;
  onEvent: (cb: (event: RaidEvent) => void) => unknown;
};

export const MAX_TOOL_SUBGROUP = 8;

function guidFor(env: { ctx: Ctx; store: Store }, name: string): bigint {
  const party = env.ctx.legacy.party();
  const state = env.store.snapshot();
  const raid = state.group?.members.find((member) => member.name === name);
  const found = raid ?? party.members.find((member) => member.name === name);
  if (!found) throw new Error(`not in your party: ${name}`);
  return found.guid;
}

function moveActs(env: {
  ctx: Ctx;
  store: Store;
}): Pick<StructureActs, "convertToRaid" | "moveToSubgroup" | "swapSubgroups"> {
  function convertToRaid(): void {
    env.ctx.send(GameOpcode.CMSG_GROUP_RAID_CONVERT, buildGroupRaidConvert());
  }
  function moveToSubgroup(name: string, group: number): void {
    if (!Number.isInteger(group) || group < 1 || group > MAX_TOOL_SUBGROUP)
      throw new Error(`subgroup must be a group 1-${MAX_TOOL_SUBGROUP}`);
    guidFor(env, name);
    env.ctx.send(
      GameOpcode.CMSG_GROUP_CHANGE_SUB_GROUP,
      buildGroupChangeSubGroup(name, group - 1),
    );
  }
  function swapSubgroups(name: string, withName: string): void {
    guidFor(env, name);
    guidFor(env, withName);
    env.ctx.send(
      GameOpcode.CMSG_GROUP_SWAP_SUB_GROUP,
      buildGroupSwapSubGroup(name, withName),
    );
  }
  return { convertToRaid, moveToSubgroup, swapSubgroups };
}

function roleActs(env: {
  ctx: Ctx;
  store: Store;
}): Pick<
  StructureActs,
  "setAssistant" | "setMainTank" | "setMainAssist" | "uninviteGuid"
> {
  function setAssistant(name: string, on: boolean): void {
    env.ctx.send(
      GameOpcode.CMSG_GROUP_ASSISTANT_LEADER,
      buildGroupAssistantLeader(guidFor(env, name), on),
    );
  }
  function setMainTank(name: string, on: boolean): void {
    env.ctx.send(
      GameOpcode.MSG_PARTY_ASSIGNMENT,
      buildPartyAssignment(PARTY_ASSIGN_MAIN_TANK, on, guidFor(env, name)),
    );
  }
  function setMainAssist(name: string, on: boolean): void {
    env.ctx.send(
      GameOpcode.MSG_PARTY_ASSIGNMENT,
      buildPartyAssignment(PARTY_ASSIGN_MAIN_ASSIST, on, guidFor(env, name)),
    );
  }
  function uninviteGuid(name: string, reason: string): void {
    env.ctx.send(
      GameOpcode.CMSG_GROUP_UNINVITE_GUID,
      buildGroupUninviteGuid(guidFor(env, name), reason),
    );
  }
  return { setAssistant, setMainTank, setMainAssist, uninviteGuid };
}

function makeStructure(env: { ctx: Ctx; store: Store }) {
  return {
    act: { ...moveActs(env), ...roleActs(env) },
    dispose: () => undefined,
  };
}

export function composeStructureRuntime(env: { ctx: Ctx; store: Store }): {
  act: StructureActs;
  dispose: () => void;
} {
  return makeStructure(env);
}
