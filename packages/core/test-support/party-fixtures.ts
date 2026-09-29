import {
  emptyParty,
  type PartyMember,
  type PartyState,
} from "#wow/party-store";

export function partyMember(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    flags: 0,
    guid: 0n,
    health: null,
    level: null,
    maxHealth: null,
    name: "Partner",
    online: true,
    roles: 0,
    source: null,
    statsAt: null,
    status: 1,
    subgroup: 0,
    ...overrides,
  };
}

export function partyState(overrides: Partial<PartyState> = {}): PartyState {
  return { ...emptyParty(), ...overrides };
}
