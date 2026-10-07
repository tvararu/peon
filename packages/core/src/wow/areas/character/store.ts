import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  BarberResult,
  DeclinedNameResult,
  PlayedTime,
  PlayTimeWarning,
  RealmSplit,
} from "#wow/areas/character/protocol";
import { SHEATH_NAMES, type SheathState } from "#wow/areas/character/protocol";
import type { CharAppearance } from "#wow/areas/character/select";
import { readSelfField } from "#wow/player-state";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

export type CharOperationKind =
  | "delete"
  | "rename"
  | "customize"
  | "faction_change";

export type CharOperationResult = {
  kind: CharOperationKind;
  code: number;
  result: string;
  guid: bigint | undefined;
  name: string | undefined;
  appearance: CharAppearance | undefined;
  race: number | undefined;
};

export type CharacterState = {
  played: PlayedTime | undefined;
  barberOpen: boolean;
  barberResult: BarberResult | undefined;
  operation: CharOperationResult | undefined;
  whois: string | undefined;
  warning: PlayTimeWarning | undefined;
  declined: DeclinedNameResult | undefined;
  realmSplit: RealmSplit | undefined;
  sheath: SheathState | undefined;
  helmShown: boolean | undefined;
  cloakShown: boolean | undefined;
};

const HIDE_HELM = 0x4_00;
const HIDE_CLOAK = 0x8_00;

export type CharacterEvent =
  | { type: "played_time"; state: CharacterState }
  | { type: "barber_open"; state: CharacterState }
  | { type: "barber_result"; state: CharacterState }
  | { type: "operation"; state: CharacterState }
  | { type: "whois"; state: CharacterState }
  | { type: "play_warning"; state: CharacterState }
  | { type: "declined_names"; state: CharacterState }
  | { type: "realm_split"; state: CharacterState };

export class CharacterStore {
  private readonly events = new Emitter<[CharacterEvent]>();
  private readonly deps: SessionDeps;
  private played: PlayedTime | undefined;
  private barberOpen = false;
  private barberResult: BarberResult | undefined;
  private operation: CharOperationResult | undefined;
  private whois: string | undefined;
  private warning: PlayTimeWarning | undefined;
  private declined: DeclinedNameResult | undefined;
  private realmSplit: RealmSplit | undefined;

  constructor(deps: SessionDeps) {
    this.deps = deps;
  }

  snapshot(): CharacterState {
    const guid = this.deps.selfGuid();
    const entity = this.deps.getEntity(guid);
    const flags = readSelfField(guid, entity, PLAYER_FIELDS.FLAGS.offset);
    const bytes = readSelfField(guid, entity, UNIT_FIELDS.BYTES_2.offset);
    return {
      played: this.played,
      barberOpen: this.barberOpen,
      barberResult: this.barberResult,
      operation: this.operation,
      whois: this.whois,
      warning: this.warning,
      declined: this.declined,
      realmSplit: this.realmSplit,
      sheath: bytes === undefined ? undefined : SHEATH_NAMES[bytes & 0xff],
      helmShown: flags === undefined ? undefined : (flags & HIDE_HELM) === 0,
      cloakShown: flags === undefined ? undefined : (flags & HIDE_CLOAK) === 0,
    };
  }

  onEvent(cb: (event: CharacterEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receivePlayedTime(played: PlayedTime): void {
    this.played = played;
    this.events.emit({ type: "played_time", state: this.snapshot() });
  }

  receiveBarberOpen(): void {
    this.barberOpen = true;
    this.events.emit({ type: "barber_open", state: this.snapshot() });
  }

  receiveBarberResult(result: BarberResult): void {
    this.barberResult = result;
    if (result.result === "ok") this.barberOpen = false;
    this.events.emit({ type: "barber_result", state: this.snapshot() });
  }

  receiveOperation(operation: CharOperationResult): void {
    this.operation = operation;
    this.events.emit({ type: "operation", state: this.snapshot() });
  }

  receiveWhois(whois: string): void {
    this.whois = whois;
    this.events.emit({ type: "whois", state: this.snapshot() });
  }

  receivePlayWarning(warning: PlayTimeWarning): void {
    this.warning = warning;
    this.events.emit({ type: "play_warning", state: this.snapshot() });
  }

  receiveDeclinedNames(declined: DeclinedNameResult): void {
    this.declined = declined;
    this.events.emit({ type: "declined_names", state: this.snapshot() });
  }

  receiveRealmSplit(split: RealmSplit): void {
    this.realmSplit = split;
    this.events.emit({ type: "realm_split", state: this.snapshot() });
  }

  dispose(): void {
    this.events.clear();
  }
}
