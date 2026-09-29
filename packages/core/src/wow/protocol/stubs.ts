import { GameOpcode } from "#wow/protocol/opcodes";
import type { OpcodeDispatch } from "#wow/protocol/world";

export const STUBS: [opcode: number, label: string][] = [
  [GameOpcode.SMSG_CHANNEL_LIST, "Channel member list"],
  [GameOpcode.SMSG_GUILD_INFO, "Guild info"],
  [GameOpcode.SMSG_GUILD_BANK_LIST, "Guild bank"],
  [GameOpcode.SMSG_CHAT_PLAYER_AMBIGUOUS, "Ambiguous player name"],
  [GameOpcode.SMSG_CHAT_NOT_IN_PARTY, "Not in party"],
  [GameOpcode.SMSG_SEND_MAIL_RESULT, "Mail result"],
  [GameOpcode.SMSG_MAIL_LIST_RESULT, "Mail list"],
  [GameOpcode.SMSG_SHOW_MAILBOX, "Mailbox opened"],
  [GameOpcode.SMSG_AUCTION_LIST_RESULT, "Auction results"],
  [GameOpcode.SMSG_AUCTION_OWNER_NOTIFICATION, "Auction sold"],
  [GameOpcode.SMSG_AUCTION_BIDDER_NOTIFICATION, "Auction outbid"],
  [GameOpcode.SMSG_AUCTION_COMMAND_RESULT, "Auction result"],
  [GameOpcode.SMSG_BATTLEFIELD_STATUS, "Battleground status"],
  [GameOpcode.SMSG_BATTLEFIELD_LIST, "Battleground list"],
  [GameOpcode.SMSG_ZONE_UNDER_ATTACK, "Zone under attack"],
  [GameOpcode.SMSG_CALENDAR_SEND_CALENDAR, "Calendar"],
  [GameOpcode.SMSG_CALENDAR_EVENT_INVITE_ALERT, "Calendar invite"],
  [GameOpcode.SMSG_ARENA_TEAM_EVENT, "Arena team event"],
  [GameOpcode.SMSG_ARENA_TEAM_COMMAND_RESULT, "Arena command result"],
  [GameOpcode.SMSG_WARDEN_DATA, "Warden anti-cheat"],
];

export type StubNotice = { opcode: number; label: string; text: string };

const NAMES = new Map<number, string>(
  Object.entries(GameOpcode).map(([name, opcode]) => [opcode, name]),
);

function stubNotice(opcode: number, label: string): StubNotice {
  return { opcode, label, text: `[peon] ${label} is not yet implemented` };
}

export function unhandledNotice(opcode: number): StubNotice {
  const hex = `0x${opcode.toString(16).padStart(3, "0")}`;
  return stubNotice(opcode, NAMES.get(opcode) ?? `Opcode ${hex}`);
}

export function registerStubs(
  dispatch: OpcodeDispatch,
  notify: (notice: StubNotice) => boolean,
  stubs: readonly (readonly [opcode: number, label: string])[] = STUBS,
): void {
  for (const [opcode, label] of stubs) {
    if (dispatch.has(opcode)) continue;
    const notice = stubNotice(opcode, label);
    let fired = false;
    dispatch.on(opcode, () => {
      if (!fired) fired = notify(notice);
    });
  }
}
