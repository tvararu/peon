import type { GameObjectQueryResult } from "#wow/protocol/entity-queries";

export const GameObjectKind = {
  DOOR: 0,
  BUTTON: 1,
  QUESTGIVER: 2,
  CHEST: 3,
  GENERIC: 5,
  TRAP: 6,
  SPELL_FOCUS: 8,
  TEXT: 9,
  GOOBER: 10,
  AREADAMAGE: 12,
  CAMERA: 13,
  FLAGSTAND: 24,
  FISHINGHOLE: 25,
  FLAGDROP: 26,
} as const;

export type GameObjectTemplate = {
  entry: number;
  type: number;
  displayId: number;
  name: string;
  iconName: string;
  castBarCaption: string;
  data: readonly number[];
  size: number;
  questItems: readonly number[];
  lockId: number;
  pageId: number | undefined;
  questId: number | undefined;
};

type TemplateData = { type: number; data: readonly number[] };

const LOCK_WORD: Readonly<Record<number, number>> = {
  [GameObjectKind.DOOR]: 1,
  [GameObjectKind.BUTTON]: 1,
  [GameObjectKind.QUESTGIVER]: 0,
  [GameObjectKind.CHEST]: 0,
  [GameObjectKind.TRAP]: 0,
  [GameObjectKind.GOOBER]: 0,
  [GameObjectKind.AREADAMAGE]: 0,
  [GameObjectKind.CAMERA]: 0,
  [GameObjectKind.FLAGSTAND]: 0,
  [GameObjectKind.FISHINGHOLE]: 4,
  [GameObjectKind.FLAGDROP]: 0,
};

const PAGE_WORD: Readonly<Record<number, number>> = {
  [GameObjectKind.TEXT]: 0,
  [GameObjectKind.GOOBER]: 7,
};

const QUEST_WORD: Readonly<Record<number, number>> = {
  [GameObjectKind.CHEST]: 8,
  [GameObjectKind.GENERIC]: 5,
  [GameObjectKind.SPELL_FOCUS]: 4,
  [GameObjectKind.GOOBER]: 1,
};

function word(
  t: TemplateData,
  index: Readonly<Record<number, number>>,
): number | undefined {
  const at = index[t.type];
  return at === undefined ? undefined : (t.data[at] ?? 0);
}

export function lockId(t: TemplateData): number {
  return word(t, LOCK_WORD) ?? 0;
}

export function pageId(t: TemplateData): number | undefined {
  return word(t, PAGE_WORD) || undefined;
}

export function questId(t: TemplateData): number | undefined {
  const id = word(t, QUEST_WORD);
  return id ? id | 0 : undefined;
}

export function questItems(t: { questItems: readonly number[] }): number[] {
  return t.questItems.filter((item) => item !== 0);
}

export function gameObjectTemplate(
  reply: Extract<GameObjectQueryResult, { name: string }>,
): GameObjectTemplate {
  const body = { type: reply.gameObjectType, data: reply.data };
  return {
    entry: reply.entry,
    type: reply.gameObjectType,
    displayId: reply.displayId,
    name: reply.name,
    iconName: reply.iconName,
    castBarCaption: reply.castBarCaption,
    data: reply.data,
    size: reply.size,
    questItems: questItems(reply),
    lockId: lockId(body),
    pageId: pageId(body),
    questId: questId(body),
  };
}
