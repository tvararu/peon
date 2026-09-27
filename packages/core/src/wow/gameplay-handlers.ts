import { parseAuraUpdate, parseAuraUpdateAll } from "#wow/protocol/aura";
import {
  ATTACK_SWING_ERRORS,
  parseAttackStart,
  parseAttackStop,
  parseCancelAutoRepeat,
  parseXpGain,
} from "#wow/protocol/combat";
import {
  parseCorpseQuery,
  parseCorpseReclaimDelay,
  parseDeathReleaseLocation,
  parseResurrectRequest,
  parseSpiritHealerConfirm,
} from "#wow/protocol/death";
import { parseLevelUpInfo } from "#wow/protocol/experience";
import { parseGossipMessage } from "#wow/protocol/gossip";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { parseItemQueryResponse } from "#wow/protocol/item";
import {
  parseItemPushResult,
  parseLootAllPassed,
  parseLootMoneyNotify,
  parseLootReleaseResponse,
  parseLootRemoved,
  parseLootResponse,
  parseLootRoll,
  parseLootRollWon,
  parseLootStartRoll,
} from "#wow/protocol/loot";
import { parseMonsterMove } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import {
  parseQuestFailed,
  parseQuestInvalid,
  parseQuestUpdateAddItem,
  parseQuestUpdateAddKill,
  parseQuestUpdateComplete,
  parseQuestUpdateFailed,
  parseQuestUpdateFailedTimer,
} from "#wow/protocol/quest-log";
import { parseQuestQueryResponse } from "#wow/protocol/quest-query";
import {
  parseQuestgiverOfferReward,
  parseQuestgiverQuestComplete,
  parseQuestgiverQuestDetails,
  parseQuestgiverQuestList,
  parseQuestgiverRequestItems,
  parseQuestgiverStatus,
} from "#wow/protocol/questgiver";
import {
  parseCastFailed,
  parseCooldownNotice,
  parseInitialSpells,
  parseLearnedSpell,
  parseRemovedSpell,
  parseSpellCooldown,
  parseSpellDelayed,
  parseSpellFailure,
  parseSpellGo,
  parseSpellStart,
  parseSupersededSpell,
} from "#wow/protocol/spell";
import {
  parseTrainerBuyFailed,
  parseTrainerBuySucceeded,
  parseTrainerList,
} from "#wow/protocol/trainer";
import {
  parseBuyFailed,
  parseBuyItem,
  parseListInventory,
  parseSellItemFailure,
} from "#wow/protocol/vendor";
import type { QuestDialog } from "#wow/quests-requests";
import type { SessionStores } from "#wow/session-stores";
import type { WorldConn } from "#wow/world-conn";

type CombatStores = Pick<SessionStores, "combat" | "motion" | "self">;

export function registerCombatHandlers(
  conn: WorldConn,
  stores: CombatStores,
): void {
  registerSpellHandlers(conn, stores);
  registerMeleeHandlers(conn, stores);
}

function registerSpellHandlers(
  conn: WorldConn,
  { combat }: CombatStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_INITIAL_SPELLS, (r) =>
    combat.applyInitialSpells(parseInitialSpells(r)),
  );
  on(GameOpcode.SMSG_LEARNED_SPELL, (r) =>
    combat.applyLearned(parseLearnedSpell(r)),
  );
  on(GameOpcode.SMSG_REMOVED_SPELL, (r) =>
    combat.applyRemoved(parseRemovedSpell(r)),
  );
  on(GameOpcode.SMSG_SUPERCEDED_SPELL, (r) =>
    combat.applySuperseded(parseSupersededSpell(r)),
  );
  on(GameOpcode.SMSG_SPELL_START, (r) =>
    combat.applySpellStart(parseSpellStart(r)),
  );
  on(GameOpcode.SMSG_SPELL_GO, (r) => combat.applySpellGo(parseSpellGo(r)));
  on(GameOpcode.SMSG_CAST_FAILED, (r) =>
    combat.applyCastFailed(parseCastFailed(r)),
  );
  on(GameOpcode.SMSG_SPELL_FAILURE, (r) =>
    combat.applySpellFailure(parseSpellFailure(r)),
  );
  on(GameOpcode.SMSG_SPELL_COOLDOWN, (r) =>
    combat.applyCooldown(parseSpellCooldown(r)),
  );
  on(GameOpcode.SMSG_CLEAR_COOLDOWN, (r) =>
    combat.applyClearCooldown(parseCooldownNotice(r)),
  );
  on(GameOpcode.SMSG_COOLDOWN_EVENT, (r) =>
    combat.applyCooldownEvent(parseCooldownNotice(r)),
  );
  on(GameOpcode.SMSG_SPELL_DELAYED, (r) =>
    combat.applySpellDelayed(parseSpellDelayed(r)),
  );
}

function registerMeleeHandlers(
  conn: WorldConn,
  { combat, motion, self }: CombatStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_CANCEL_COMBAT, () => combat.applyCancelCombat());
  for (const [opcode, error] of ATTACK_SWING_ERRORS)
    on(opcode, () => combat.applyAttackError(error));
  on(GameOpcode.SMSG_ATTACKSTART, (r) =>
    combat.applyAttackStart(parseAttackStart(r)),
  );
  on(GameOpcode.SMSG_ATTACKSTOP, (r) =>
    combat.applyAttackStop(parseAttackStop(r)),
  );
  on(GameOpcode.SMSG_CANCEL_AUTO_REPEAT, (r) =>
    combat.applyCancelAutoRepeat(parseCancelAutoRepeat(r)),
  );
  on(GameOpcode.SMSG_AURA_UPDATE, (r) => combat.applyAura(parseAuraUpdate(r)));
  on(GameOpcode.SMSG_AURA_UPDATE_ALL, (r) =>
    combat.applyAuraAll(parseAuraUpdateAll(r)),
  );
  on(GameOpcode.SMSG_LOG_XPGAIN, (r) => combat.applyXp(parseXpGain(r)));
  on(GameOpcode.SMSG_LEVELUP_INFO, (r) =>
    combat.applyLevelUp(parseLevelUpInfo(r)),
  );
  on(GameOpcode.SMSG_MONSTER_MOVE, (r) => {
    const move = parseMonsterMove(r);
    const mapId = self.mapId;
    const orientation = conn.entityStore.get(move.guid)?.position?.orientation;
    conn.entityStore.setPosition(move.guid, {
      mapId,
      ...move.start,
      orientation: orientation ?? 0,
    });
    motion.monsterMove(move, mapId);
  });
}

export function registerQuestHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  const dialog = (opcode: number, read: (r: PacketReader) => QuestDialog) =>
    on(opcode, (r) => stores.quests.openDialog(read(r)));
  dialog(GameOpcode.SMSG_GOSSIP_MESSAGE, (r) => ({
    kind: "gossip",
    data: parseGossipMessage(r),
  }));
  dialog(GameOpcode.SMSG_QUESTGIVER_QUEST_LIST, (r) => ({
    kind: "list",
    data: parseQuestgiverQuestList(r),
  }));
  dialog(GameOpcode.SMSG_QUESTGIVER_QUEST_DETAILS, (r) => ({
    kind: "details",
    data: parseQuestgiverQuestDetails(r),
  }));
  dialog(GameOpcode.SMSG_QUESTGIVER_REQUEST_ITEMS, (r) => ({
    kind: "requestItems",
    data: parseQuestgiverRequestItems(r),
  }));
  dialog(GameOpcode.SMSG_QUESTGIVER_OFFER_REWARD, (r) => ({
    kind: "offer",
    data: parseQuestgiverOfferReward(r),
  }));
  on(GameOpcode.SMSG_GOSSIP_COMPLETE, () => stores.quests.closeDialog());
  on(GameOpcode.SMSG_QUEST_QUERY_RESPONSE, (r) =>
    stores.quests.receiveQuery(parseQuestQueryResponse(r)),
  );
  on(GameOpcode.SMSG_SHOW_BANK, (r) =>
    stores.quests.receiveWindow(r.uint64LE(), "bank"),
  );
  on(GameOpcode.SMSG_SHOWTAXINODES, (r) => {
    r.uint32LE();
    stores.quests.receiveWindow(r.uint64LE(), "taxi");
  });
  registerQuestProgressHandlers(conn, stores);
}

function registerQuestProgressHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_QUESTGIVER_QUEST_COMPLETE, (r) =>
    stores.quests.receiveReward(parseQuestgiverQuestComplete(r)),
  );
  on(GameOpcode.SMSG_QUESTGIVER_STATUS, (r) =>
    stores.quests.receiveStatus(parseQuestgiverStatus(r)),
  );
  on(GameOpcode.SMSG_QUESTUPDATE_ADD_KILL, (r) =>
    stores.quests.receiveProgress({
      kind: "kill",
      data: parseQuestUpdateAddKill(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTUPDATE_ADD_ITEM, (r) =>
    stores.quests.receiveProgress({
      kind: "item",
      data: parseQuestUpdateAddItem(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTUPDATE_COMPLETE, (r) =>
    stores.quests.receiveProgress({
      kind: "complete",
      ...parseQuestUpdateComplete(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTGIVER_QUEST_INVALID, (r) =>
    stores.quests.receiveError({ kind: "invalid", ...parseQuestInvalid(r) }),
  );
  on(GameOpcode.SMSG_QUESTGIVER_QUEST_FAILED, (r) =>
    stores.quests.receiveError({
      kind: "quest_failed",
      ...parseQuestFailed(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTUPDATE_FAILED, (r) =>
    stores.quests.receiveError({
      kind: "failed",
      ...parseQuestUpdateFailed(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTUPDATE_FAILEDTIMER, (r) =>
    stores.quests.receiveError({
      kind: "timer_failed",
      ...parseQuestUpdateFailedTimer(r),
    }),
  );
  on(GameOpcode.SMSG_QUESTLOG_FULL, () =>
    stores.quests.receiveError({ kind: "log_full" }),
  );
}

export function registerLootHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const { combat, rewards, items } = stores;
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_LOOT_RESPONSE, (r) =>
    rewards.receiveLootResponse(parseLootResponse(r)),
  );
  on(GameOpcode.SMSG_LOOT_REMOVED, (r) =>
    rewards.receiveLootRemoved(parseLootRemoved(r)),
  );
  on(GameOpcode.SMSG_LOOT_RELEASE_RESPONSE, (r) =>
    rewards.receiveLootRelease(parseLootReleaseResponse(r)),
  );
  on(GameOpcode.SMSG_LOOT_MONEY_NOTIFY, (r) =>
    rewards.receiveMoneyNotice(parseLootMoneyNotify(r)),
  );
  on(GameOpcode.SMSG_LOOT_CLEAR_MONEY, () => rewards.receiveLootMoneyCleared());
  on(GameOpcode.SMSG_LOOT_START_ROLL, (r) =>
    rewards.rolls.receiveStart(parseLootStartRoll(r)),
  );
  on(GameOpcode.SMSG_LOOT_ROLL, (r) =>
    rewards.rolls.receiveRoll(parseLootRoll(r)),
  );
  on(GameOpcode.SMSG_LOOT_ROLL_WON, (r) =>
    rewards.rolls.receiveWon(parseLootRollWon(r)),
  );
  on(GameOpcode.SMSG_LOOT_ALL_PASSED, (r) =>
    rewards.rolls.receiveAllPassed(parseLootAllPassed(r)),
  );
  on(GameOpcode.SMSG_ITEM_PUSH_RESULT, (r) => {
    const push = parseItemPushResult(r);
    rewards.receiveItemPush(push);
    stores.quests.receiveItemPush(push);
  });
  on(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, (r) => {
    const packet = parseInventoryChangeFailure(r);
    rewards.receiveInventoryFailure(packet);
    combat.applyInventoryFailure(packet);
    stores.vendor.receiveInventoryFailure(packet);
    stores.quests.receiveInventoryFailure(packet);
    stores.destroy.receiveInventoryFailure(packet);
  });
  on(GameOpcode.SMSG_ITEM_QUERY_SINGLE_RESPONSE, (r) =>
    items.receive(parseItemQueryResponse(r)),
  );
}

export function registerTrainerHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_TRAINER_LIST, (r) => {
    const list = parseTrainerList(r);
    stores.quests.receiveWindow(list.guid, "trainer");
    stores.trainer.receiveList(list);
  });
  on(GameOpcode.SMSG_TRAINER_BUY_SUCCEEDED, (r) =>
    stores.trainer.receiveSucceeded(parseTrainerBuySucceeded(r)),
  );
  on(GameOpcode.SMSG_TRAINER_BUY_FAILED, (r) =>
    stores.trainer.receiveFailed(parseTrainerBuyFailed(r)),
  );
}

export function registerVendorHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.SMSG_LIST_INVENTORY, (r) => {
    const list = parseListInventory(r);
    stores.quests.receiveWindow(list.guid, "vendor");
    stores.vendor.receiveInventory(list);
  });
  on(GameOpcode.SMSG_SELL_ITEM, (r) =>
    stores.vendor.receiveSellFailure(parseSellItemFailure(r)),
  );
  on(GameOpcode.SMSG_BUY_ITEM, (r) =>
    stores.vendor.receiveBuyItem(parseBuyItem(r)),
  );
  on(GameOpcode.SMSG_BUY_FAILED, (r) =>
    stores.vendor.receiveBuyFailure(parseBuyFailed(r)),
  );
}

export function registerRecoveryHandlers(
  conn: WorldConn,
  stores: SessionStores,
): void {
  const on = (opcode: number, handle: (r: PacketReader) => void) =>
    conn.dispatch.on(opcode, handle);
  on(GameOpcode.MSG_CORPSE_QUERY, (r) =>
    stores.recovery.receiveCorpse(parseCorpseQuery(r)),
  );
  on(GameOpcode.SMSG_CORPSE_RECLAIM_DELAY, (r) =>
    stores.recovery.receiveReclaimDelay(parseCorpseReclaimDelay(r)),
  );
  on(GameOpcode.SMSG_DEATH_RELEASE_LOC, (r) =>
    stores.recovery.receiveGraveyard(parseDeathReleaseLocation(r)),
  );
  on(GameOpcode.SMSG_RESURRECT_REQUEST, (r) =>
    stores.recovery.receiveResurrectRequest(parseResurrectRequest(r)),
  );
  on(GameOpcode.SMSG_SPIRIT_HEALER_CONFIRM, (r) =>
    stores.recovery.receiveSpiritHealerConfirm(parseSpiritHealerConfirm(r)),
  );
}
