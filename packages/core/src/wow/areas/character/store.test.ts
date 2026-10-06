import { describe, expect, test } from "bun:test";
import { CharacterStore } from "#wow/areas/character/store";

function store() {
  return new CharacterStore({
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => 0n,
    send: () => undefined,
    updateEntity: () => undefined,
  });
}

describe("character store", () => {
  test("played time keeps both counters and emits", () => {
    const s = store();
    const types: string[] = [];
    s.onEvent((e) => types.push(e.type));
    s.receivePlayedTime({ levelSeconds: 3, totalSeconds: 10, trigger: true });
    expect(s.snapshot()).toMatchObject({
      played: { levelSeconds: 3, totalSeconds: 10, trigger: true },
    });
    expect(types).toEqual(["played_time"]);
    s.dispose();
  });

  test("barber open stays until an ok result closes it", () => {
    const s = store();
    const types: string[] = [];
    s.onEvent((e) => types.push(e.type));
    s.receiveBarberOpen();
    s.receiveBarberResult({ code: 2, result: "not_seated" });
    expect(s.snapshot()).toMatchObject({
      barberOpen: true,
      barberResult: { code: 2, result: "not_seated" },
    });
    s.receiveBarberResult({ code: 0, result: "ok" });
    expect(s.snapshot()).toMatchObject({ barberOpen: false });
    expect(types).toEqual(["barber_open", "barber_result", "barber_result"]);
    s.dispose();
  });

  test("visibility stays unknown without entity fields", () => {
    const s = store();
    expect(s.snapshot()).toMatchObject({
      cloakShown: undefined,
      helmShown: undefined,
      sheath: undefined,
    });
    s.dispose();
  });

  test("operations, whois and warnings record and emit", () => {
    const s = store();
    const types: string[] = [];
    s.onEvent((e) => types.push(e.type));
    s.receiveOperation({
      appearance: undefined,
      code: 0x47,
      guid: undefined,
      kind: "delete",
      name: undefined,
      race: undefined,
      result: "success",
    });
    s.receiveWhois("line");
    s.receivePlayWarning({ flag: 1, remainingSeconds: 300 });
    expect(s.snapshot()).toMatchObject({
      operation: { kind: "delete", result: "success" },
      warning: { flag: 1, remainingSeconds: 300 },
      whois: "line",
    });
    expect(types).toEqual(["operation", "whois", "play_warning"]);
    s.dispose();
  });
});
