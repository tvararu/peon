import type { AreaEventOf, AreaState } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type PetsEvent = AreaEventOf<"pets">;
type PetsState = AreaState<"pets">;
type Bar = Extract<PetsEvent, { type: "bar"; cleared: false }>["bar"];

const FAMILIES: Readonly<Record<number, string>> = {
  1: "Wolf",
  2: "Cat",
  3: "Spider",
  4: "Bear",
  5: "Boar",
  6: "Crocolisk",
  7: "Carrion Bird",
  8: "Crab",
  9: "Gorilla",
  11: "Raptor",
  12: "Tallstrider",
  15: "Felhunter",
  16: "Voidwalker",
  17: "Succubus",
  19: "Doomguard",
  20: "Scorpid",
  21: "Turtle",
  23: "Imp",
  24: "Bat",
  25: "Hyena",
  26: "Bird of Prey",
  27: "Wind Serpent",
  28: "Remote Control",
  29: "Felguard",
  30: "Dragonhawk",
  31: "Ravager",
  32: "Warp Stalker",
  33: "Sporebat",
  34: "Nether Ray",
  35: "Serpent",
  37: "Moth",
  38: "Chimaera",
  39: "Devilsaur",
  40: "Ghoul",
  41: "Silithid",
  42: "Worm",
  43: "Rhino",
  44: "Wasp",
  45: "Core Hound",
  46: "Spirit Beast",
};

function outRow(
  bar: Bar,
  rc: RuleInput,
  last: { guid: bigint | undefined },
): AreaDraft {
  last.guid = bar.guid;
  const name = rc.lookup.unitName(bar.guid) ?? "Your pet";
  const family = FAMILIES[bar.family] ?? `family ${bar.family}`;
  return {
    class: "log",
    data: {
      command: bar.command,
      family: bar.family,
      name: rc.lookup.unitName(bar.guid),
      react: bar.react,
    },
    guid: guidText(bar.guid),
    name: "out",
    ref: rc.refOf(bar.guid),
    text: `${name} (${family}) is out: ${bar.react}, ${bar.command}.`,
  };
}

function goneRow(last: { guid: bigint | undefined }): readonly AreaDraft[] {
  if (last.guid === undefined) return [];
  last.guid = undefined;
  return [
    {
      class: "log",
      data: {},
      name: "gone",
      text: "Your pet is gone.",
    },
  ];
}

function barRow(
  event: Extract<PetsEvent, { type: "bar" }>,
  rc: RuleInput,
  last: { guid: bigint | undefined },
): readonly AreaDraft[] {
  if (event.cleared) return goneRow(last);
  if (event.bar.guid === last.guid) return [];
  return [outRow(event.bar, rc, last)];
}

function renamedRow(name: string): AreaDraft {
  return {
    class: "log",
    data: { name },
    name: "renamed",
    text: `Your pet is now named ${name}.`,
  };
}

function stableRow(result: string): AreaDraft {
  return {
    class: "log",
    data: { result },
    name: "stable",
    text: `Stable: ${result.replaceAll("_", " ")}.`,
  };
}

function unansweredRow(request: string): AreaDraft {
  return {
    class: "log",
    data: { request },
    name: "unanswered",
    text: `The server did not answer the ${request}.`,
  };
}

function refusedRow(reason: string, spell?: number): AreaDraft {
  const text =
    spell === undefined
      ? `Your pet refused: ${reason.replaceAll("_", " ")}.`
      : `Your pet refused: ${reason} (spell ${spell}).`;
  return {
    class: "log",
    data: spell === undefined ? { reason } : { reason, spell },
    name: "refused",
    text,
  };
}

function laterRow(
  event: Exclude<PetsEvent, { type: "bar" }>,
): AreaDraft | undefined {
  if (event.type === "feedback") return refusedRow(event.reason);
  if (event.type === "cast_failed")
    return event.reason === "dont_report"
      ? undefined
      : refusedRow(event.reason, event.spell);
  if (event.type === "spell_learned")
    return {
      class: "log",
      data: { spell: event.spell },
      name: "learned",
      text: `Your pet learned spell ${event.spell}.`,
    };
  if (event.type === "name") return renamedRow(event.name.name);
  if (event.type === "name_invalid") return refusedRow(event.reason);
  if (event.type === "tame_failed") return refusedRow(event.reason);
  if (event.type === "stable_result") return stableRow(event.result);
  if (event.type === "unanswered") return unansweredRow(event.request);
  return undefined;
}

export const petsHarness = defineHarnessArea({
  area: "pets",
  glyph: "friendly",
  rules: () => {
    const last: { guid: bigint | undefined } = { guid: undefined };
    return {
      attach: (state: PetsState, rc: RuleInput) => {
        if (!state.bar) return [];
        return [outRow(state.bar, rc, last)];
      },
      event: (event: PetsEvent, rc: RuleInput): readonly AreaDraft[] => {
        if (event.type === "bar") return barRow(event, rc, last);
        const row = laterRow(event);
        return row ? [row] : [];
      },
    };
  },
});
