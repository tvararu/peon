import type { WorldHandle } from "#wow/client";
import { readExperience } from "#wow/experience";
import { labelInventory, labelRewards } from "#wow/item-labels";
import { useItem } from "#wow/item-use";
import { questCycleObjective } from "#wow/quest-cycle";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid } from "#wow/world-handlers";

export function combatMethods(conn: WorldConn, rt: Runtimes) {
  const { combat, tactics, recovery } = rt;
  return {
    getCombatState() {
      return combat.snapshot();
    },
    async getSpellbook() {
      await rt.prepareCatalog();
      return combat.spellbook();
    },
    cast(spellId, targetGuid) {
      combat.cast(spellId, targetGuid);
    },
    attack(targetGuid) {
      combat.attack(targetGuid);
    },
    cancelCast() {
      combat.cancelCast();
    },
    stopAttack() {
      combat.stopAttack();
    },
    startTactics(targetGuid, instruction, signal, framing) {
      const life = recovery.snapshot().life;
      if (life === "dead" || life === "ghost")
        throw new Error("self_not_alive");
      return tactics.start({ targetGuid, instruction, framing }, signal);
    },
    getTacticsState() {
      return tactics.snapshot();
    },
    onCombatEvent(cb) {
      return conn.events.combat.subscribe(cb);
    },
    onTacticsEvent(cb) {
      return conn.events.tactics.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function recoveryMethods(conn: WorldConn, rt: Runtimes) {
  const { recovery } = rt;
  return {
    getRecoveryState() {
      return recovery.snapshot();
    },
    queryCorpse() {
      recovery.queryCorpse();
    },
    releaseSpirit() {
      recovery.releaseSpirit();
    },
    reclaimCorpse() {
      recovery.reclaimCorpse();
    },
    activateSpiritHealer(guid) {
      recovery.activateSpiritHealer(guid);
    },
    respondResurrection(accept) {
      recovery.respondResurrection(accept);
    },
    onRecoveryEvent(cb) {
      return conn.events.recovery.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function questMethods(conn: WorldConn, rt: Runtimes) {
  const { quests } = rt;
  return {
    getQuestState() {
      return quests.snapshot();
    },
    talk(guid) {
      quests.talk(guid);
    },
    queryQuest(questId) {
      quests.query(questId);
    },
    selectGossipOption(optionId, code) {
      quests.selectOption(optionId, code);
    },
    selectQuest(questId) {
      quests.selectQuest(questId);
    },
    acceptQuest() {
      quests.accept();
    },
    onQuestEvent(cb) {
      return conn.events.quest.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function questRewardMethods(rt: Runtimes) {
  const { quests } = rt;
  return {
    completeQuest(questId) {
      quests.complete(questId);
    },
    requestQuestReward() {
      quests.requestReward();
    },
    chooseQuestReward(index) {
      quests.chooseReward(index);
    },
    abandonQuest(slot) {
      quests.abandon(slot);
    },
    cancelInteraction() {
      quests.cancel();
    },
  } satisfies Partial<WorldHandle>;
}

export function rewardsMethods(conn: WorldConn, rt: Runtimes) {
  const { rewards, items, combat } = rt;
  return {
    getInventoryState() {
      return labelInventory(rewards.snapshot().inventory, (entry) =>
        items.label(entry),
      );
    },
    getExperienceState() {
      return readExperience(
        selfGuid(conn),
        (guid) => conn.entityStore.get(guid),
        rt.combat.snapshot(),
      );
    },
    itemLabel(entry) {
      return items.label(entry);
    },
    getRewardsState() {
      return labelRewards(rewards.snapshot(), (entry) => items.label(entry));
    },
    openLoot(guid) {
      rewards.open(guid);
    },
    takeLoot(slot) {
      rewards.take(slot);
    },
    takeLootMoney() {
      rewards.takeMoney();
    },
    releaseLoot() {
      rewards.close();
    },
    useItem(bag, slot) {
      const inventory = () => rewards.snapshot().inventory;
      return useItem({ inventory, templates: items, combat }, bag, slot);
    },
    rollLoot(guid, slot, vote) {
      rewards.roll(guid, slot, vote);
    },
    onRewardsEvent(cb) {
      return conn.events.rewards.subscribe(cb);
    },
    destroyItem(bag, slot, count) {
      rt.destroy.destroy(bag, slot, count);
    },
    getDestroyState() {
      return rt.destroy.snapshot();
    },
    onDestroyEvent(cb) {
      return conn.events.destroy.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function cycleMethods(conn: WorldConn, rt: Runtimes) {
  const { cycle } = rt;
  return {
    async startCycle(guids, instruction, maxStarts) {
      rt.takeControl("manual_override");
      rt.halt();
      await cycle.start({ guids, instruction, maxStarts });
    },
    async startQuestCycle(questId, sources, instruction, maxStarts) {
      const { objective, defaultMaxStarts } = await questCycleObjective(
        conn,
        rt,
        questId,
        sources,
      );
      rt.takeControl("manual_override");
      rt.halt();
      await cycle.start({
        guids: [],
        instruction,
        maxStarts: maxStarts ?? defaultMaxStarts,
        objective,
      });
    },
    stopCycle() {
      cycle.stop("manual_override");
    },
    getCycleState() {
      return cycle.snapshot();
    },
    onCycleEvent(cb) {
      return conn.events.cycle.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}
