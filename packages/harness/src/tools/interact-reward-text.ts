import type { QuestDialog, QuestState, WorldHandle } from "@tuicraft/core";
import type { RewardChoice } from "#harness/contract/details";
import {
  awaitItemNames,
  gearKind,
  ITEM_NAME_WAIT_MS,
  itemIdText,
} from "#harness/ops/item-names";
import { shortMoney } from "#harness/tools/interact-quest";

type Offer = Extract<QuestDialog, { kind: "offer" }>;
type Reward = NonNullable<QuestState["lastReward"]>;
type Names = Pick<WorldHandle, "itemLabel">;
export type NamedChoice = RewardChoice & { kind: string | undefined };

export async function nameRewards(
  handle: Names,
  offer: Offer,
  signal: AbortSignal,
): Promise<void> {
  const { choices, items } = offer.data.rewards;
  const ids = [...choices, ...items].map((item) => item.itemId);
  await awaitItemNames(ids, (id) => handle.itemLabel(id).name ?? undefined, {
    signal,
    timeoutMs: ITEM_NAME_WAIT_MS,
  });
}

export function choicesOf(handle: Names, offer: Offer): NamedChoice[] {
  return offer.data.rewards.choices.map((choice, index) => {
    const label = handle.itemLabel(choice.itemId);
    return {
      count: choice.count,
      index: index + 1,
      kind: gearKind(label),
      name: label.name ?? itemIdText(choice.itemId),
    };
  });
}

export function choiceLine(choice: NamedChoice): string {
  const kind = choice.kind ? ` (${choice.kind})` : "";
  const count = choice.count > 1 ? ` x${choice.count}` : "";
  return `${choice.index}. ${choice.name}${kind}${count}`;
}

function itemText(handle: Names, item: { itemId: number; count: number }) {
  const name = handle.itemLabel(item.itemId).name ?? itemIdText(item.itemId);
  return item.count > 1 ? `${name} x${item.count}` : name;
}

export function rewardText(init: {
  handle: Names;
  offer: Offer;
  picked: number;
  reward: Reward | undefined;
}): string {
  const { handle, offer, picked, reward } = init;
  const { choices, items } = offer.data.rewards;
  const chosen = choices[picked];
  const parts = [
    reward && reward.experience > 0 ? `${reward.experience} XP` : "",
    reward && reward.money > 0 ? shortMoney(reward.money) : "",
    ...items.map((item) => itemText(handle, item)),
    chosen ? itemText(handle, chosen) : "",
  ].filter((part) => part !== "");
  return parts.length > 0 ? ` Reward: ${parts.join(", ")}.` : "";
}
