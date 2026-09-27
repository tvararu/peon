import type { WorldHandle } from "#wow/client";
import { readExperience } from "#wow/experience";
import { labelInventory, labelRewards } from "#wow/item-labels";
import { useItem } from "#wow/item-use";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid } from "#wow/world-handlers";

export function combatMethods(conn: WorldConn, rt: Runtimes) {
  const { combat } = rt;
  return {
    getCombatState(targetGuid) {
      return targetGuid === undefined
        ? combat.snapshot()
        : combat.snapshot(targetGuid);
    },
    async getSpellbook() {
      await rt.prepareCatalog();
      return combat.spellbook();
    },
    loadCatalogs() {
      return rt.loadCatalogs();
    },
    spellDefinition(spellId) {
      return combat.definition(spellId);
    },
    spellReadyAt(spellId) {
      return combat.readyAt(spellId);
    },
    isAttackingSelf(guid) {
      return combat.isAttackingSelf(guid);
    },
    getSelfClass() {
      return conn.selfClass;
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
    stopAutoRepeat() {
      combat.stopAutoRepeat();
    },
    petAttack(petGuid, targetGuid) {
      combat.petAttack(petGuid, targetGuid);
    },
    stopCombat() {
      combat.halt();
    },
    onCombatEvent(cb) {
      return conn.events.combat.subscribe(cb);
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
    abandonLoot() {
      rewards.abandonOpen();
    },
    getItemTemplate(entry) {
      return items.lookup(entry);
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
