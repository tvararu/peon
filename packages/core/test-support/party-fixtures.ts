import {
  emptyParty,
  type PartyMember,
  type PartyState,
} from "#wow/party-store";

export function partyMember(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    auras: [],
    flags: 0,
    guid: 0n,
    health: null,
    level: null,
    maxHealth: null,
    maxPower: null,
    name: "Partner",
    online: true,
    pet: null,
    position: null,
    power: null,
    powerType: null,
    roles: 0,
    source: null,
    statsAt: null,
    status: 1,
    subgroup: 0,
    vehicleSeat: null,
    zone: null,
    ...overrides,
  };
}

export function partyState(overrides: Partial<PartyState> = {}): PartyState {
  return { ...emptyParty(), ...overrides };
}
