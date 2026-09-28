import {
  type ChatMessage,
  ChatType,
  type GroupEvent,
  PartyOperation,
  PartyResult,
  type Unsubscribe,
  type WorldHandle,
} from "@peon/core";
import type { SocialAction, SocialAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { defineGameTool, result } from "#harness/tools/define";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { type SocialArgs, socialParams } from "#harness/tools/params-social";
import { socialRenderers } from "#harness/ui/renderers/line";

type ChatAction = "say" | "whisper" | "party" | "guild";
type GroupAction = Exclude<SocialAction, ChatAction>;
type Request = {
  action: SocialAction;
  text: string | undefined;
  to: string | undefined;
};
type ChatRequest = { action: ChatAction; text: string; to: string | undefined };
type GroupRequest = { action: GroupAction; to: string | undefined };
type GroupAnswer =
  | { event: GroupEvent; kind: "group" }
  | { kind: "system"; text: string };
type Outcome = Pick<
  ToolResult<SocialAfter>,
  "detail" | "next" | "reason" | "status"
> & { confirmed: boolean };
type Matcher = (answer: GroupAnswer, to: string | undefined) => boolean;
type Judge = (
  to: string | undefined,
  answer: GroupAnswer | undefined,
) => Outcome;

const SOCIAL_ACTIONS: readonly SocialAction[] = [
  "say",
  "whisper",
  "party",
  "guild",
  "invite",
  "accept_invite",
  "decline_invite",
  "leave_group",
];
const SETTLE_MS = 2000;
const INVITE_SETTLE_MS = 3000;
const NOTHING_TO_ACCEPT = "Nothing to accept.";
const NOTHING_TO_DECLINE = "Nothing to decline.";
const ECHO_TYPES: Readonly<Record<ChatAction, readonly number[]>> = {
  guild: [ChatType.GUILD],
  party: [ChatType.PARTY, ChatType.PARTY_LEADER],
  say: [ChatType.SAY],
  whisper: [ChatType.WHISPER_INFORM],
};
const SAID: Readonly<Record<ChatAction, (to: string | undefined) => string>> = {
  guild: () => "said to your guild",
  party: () => "said to your party",
  say: () => "said",
  whisper: (to) => `whispered ${to}`,
};
const PARTY_WORDS = new Map<number, string>(
  Object.entries(PartyResult).map(([word, code]) => [code, word.toLowerCase()]),
);

function emptySocial(): SocialAfter {
  return {
    action: "say",
    confirmed: false,
    systemLine: undefined,
    text: undefined,
    to: undefined,
  };
}

function isChat(action: SocialAction): action is ChatAction {
  return (
    action === "say" ||
    action === "whisper" ||
    action === "party" ||
    action === "guild"
  );
}

function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function holdsSecret(text: string, rt: HarnessRuntime): boolean {
  const lower = text.toLowerCase();
  return [rt.profile.account, rt.profile.client.password].some(
    (secret) => secret.length > 0 && lower.includes(secret.toLowerCase()),
  );
}

function checkRequest({ action, text, to }: Request, rt: HarnessRuntime): void {
  if (isChat(action) && !text) {
    const retry = { do: action, text: "…", ...(to ? { to } : {}) };
    throw new Refusal({
      detail: `${action} needs text.`,
      next: nextCall("social", retry),
      reason: "missing_text",
    });
  }
  if ((action === "whisper" || action === "invite") && !to) {
    throw new Refusal({
      detail: `${action} needs the exact player name in to.`,
      next: askHuman("Which player do you mean?"),
      reason: "missing_name",
    });
  }
  if (text && holdsSecret(text, rt)) {
    throw new Refusal({
      detail: "the text holds the account name or password.",
      next: "write the message again without them.",
      reason: "secret",
    });
  }
}

function sendChat(
  handle: WorldHandle,
  { action, text, to }: ChatRequest,
): void {
  if (action === "whisper") handle.sendWhisper(to ?? "", text);
  else if (action === "party") handle.sendParty(text);
  else if (action === "guild") handle.sendGuild(text);
  else handle.sendSay(text);
}

function isEcho(
  message: ChatMessage,
  { action, text, to }: ChatRequest,
  self: string,
): boolean {
  if (!ECHO_TYPES[action].includes(message.type) || message.message !== text)
    return false;
  return sameName(message.sender, action === "whisper" ? to : self);
}

function isNotFound(message: ChatMessage, to: string | undefined): boolean {
  if (message.type !== ChatType.SYSTEM || to === undefined) return false;
  return (
    message.message.toLowerCase() ===
    `no player named "${to.toLowerCase()}" is currently playing.`
  );
}

function chatResult(
  { action, text, to }: ChatRequest,
  answer: ChatMessage | undefined,
): ToolResult<SocialAfter> {
  const after = (confirmed: boolean, systemLine?: string): SocialAfter => ({
    action,
    confirmed,
    systemLine,
    text,
    to,
  });
  const said = `${SAID[action](to)}: "${text}"`;
  if (!answer)
    return result("UNCONFIRMED", {
      after: after(false),
      detail: `${said}; no echo in 2 s.`,
      next: nextCall("journal", { about: "log", since: "1m" }),
      reason: "no_answer",
    });
  if (answer.type === ChatType.SYSTEM) {
    const next = askHuman(`Is ${to} the right name?`);
    return result("FAILED", {
      after: after(false, answer.message),
      detail: `no player named "${to}" is online.`,
      next,
      reason: "player_not_found",
    });
  }
  return result("DONE", {
    after: after(true),
    detail: `${said} (echo confirmed)`,
  });
}

async function chat(
  request: ChatRequest,
  ctx: ToolCtx<SocialAfter>,
): Promise<ToolResult<SocialAfter>> {
  const { handle, rt } = ctx;
  const answer = await settle<ChatMessage>({
    match: (message) =>
      isEcho(message, request, rt.profile.character) ||
      isNotFound(message, request.to),
    send: () => rt.mutex.run(() => sendChat(handle, request)),
    signal: ctx.signal,
    subscribe: (cb) => handle.onMessage(cb),
    timeoutMs: SETTLE_MS,
  });
  return chatResult(request, answer);
}

const MATCHERS: Readonly<Record<GroupAction, Matcher>> = {
  accept_invite: (answer) =>
    answer.kind === "system"
      ? answer.text === NOTHING_TO_ACCEPT
      : answer.event.type === "group_list",
  decline_invite: (answer) =>
    answer.kind === "system" && answer.text === NOTHING_TO_DECLINE,
  invite: (answer, to) =>
    answer.kind === "group" &&
    answer.event.type === "command_result" &&
    answer.event.operation === PartyOperation.INVITE &&
    sameName(answer.event.target, to),
  leave_group: (answer) =>
    answer.kind === "group" &&
    (answer.event.type === "group_destroyed" ||
      (answer.event.type === "group_list" &&
        answer.event.members.length === 0)),
};

const waitFor = (to: string | undefined) =>
  `end your turn; a [game] message comes if ${to} answers.`;

function inviteOutcome(
  to: string | undefined,
  answer: GroupAnswer | undefined,
): Outcome {
  if (answer?.kind !== "group" || answer.event.type !== "command_result") {
    return {
      confirmed: false,
      detail: `invited ${to}; no answer in 3 s.`,
      next: waitFor(to),
      reason: "no_answer",
      status: "UNCONFIRMED",
    };
  }
  const code = answer.event.result;
  if (code === PartyResult.SUCCESS)
    return {
      confirmed: true,
      detail: `invited ${to}; the server sent the invite.`,
      next: waitFor(to),
      status: "DONE",
    };
  const word = PARTY_WORDS.get(code) ?? `party_result_${code}`;
  const next = askHuman(
    `The invite to ${to} failed (${word}). What should I do?`,
  );
  return {
    confirmed: false,
    detail: `the server refused the invite to ${to}.`,
    next,
    reason: word,
    status: "FAILED",
  };
}

function acceptOutcome(
  _to: string | undefined,
  answer: GroupAnswer | undefined,
): Outcome {
  if (!answer)
    return {
      confirmed: false,
      detail: "accepted the invite; no group list came in 2 s.",
      next: nextCall("look"),
      reason: "no_answer",
      status: "UNCONFIRMED",
    };
  if (answer.kind === "system") {
    return {
      confirmed: false,
      detail: "there is no invite to accept.",
      next: "end your turn and wait for an invite.",
      reason: "nothing_to_accept",
      status: "FAILED",
    };
  }
  const leader =
    answer.event.type === "group_list" ? answer.event.leader : "the leader";
  return {
    confirmed: true,
    detail: `joined the group of ${leader}.`,
    status: "DONE",
  };
}

function declineOutcome(
  _to: string | undefined,
  answer: GroupAnswer | undefined,
): Outcome {
  if (answer)
    return {
      confirmed: false,
      detail: "there is no invite to decline.",
      next: "end your turn.",
      reason: "nothing_to_decline",
      status: "FAILED",
    };
  return {
    confirmed: false,
    detail: "declined the invite; the server does not answer a decline.",
    next: "end your turn.",
    reason: "no_answer",
    status: "UNCONFIRMED",
  };
}

function leaveOutcome(
  _to: string | undefined,
  answer: GroupAnswer | undefined,
): Outcome {
  if (answer)
    return { confirmed: true, detail: "left the group.", status: "DONE" };
  return {
    confirmed: false,
    detail: "asked to leave the group; no answer in 2 s.",
    next: nextCall("look"),
    reason: "no_answer",
    status: "UNCONFIRMED",
  };
}

const JUDGES: Readonly<Record<GroupAction, Judge>> = {
  accept_invite: acceptOutcome,
  decline_invite: declineOutcome,
  invite: inviteOutcome,
  leave_group: leaveOutcome,
};

function sendGroup(handle: WorldHandle, { action, to }: GroupRequest): void {
  if (action === "invite") handle.invite(to ?? "");
  else if (action === "accept_invite") handle.acceptInvite();
  else if (action === "decline_invite") handle.declineInvite();
  else handle.leaveGroup();
}

function subscribeGroup(
  handle: WorldHandle,
  cb: (answer: GroupAnswer) => void,
): Unsubscribe {
  const offGroup = handle.onGroupEvent((event) => cb({ event, kind: "group" }));
  const offChat = handle.onMessage((message) => {
    if (message.type === ChatType.SYSTEM)
      cb({ kind: "system", text: message.message });
  });
  return () => {
    offGroup();
    offChat();
  };
}

async function group(
  request: GroupRequest,
  ctx: ToolCtx<SocialAfter>,
): Promise<ToolResult<SocialAfter>> {
  const { handle, rt } = ctx;
  const { action, to } = request;
  if (action === "leave_group" && !handle.getPartyState().inGroup) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const answer = await settle<GroupAnswer>({
    match: (candidate) => MATCHERS[action](candidate, to),
    send: () => rt.mutex.run(() => sendGroup(handle, request)),
    signal: ctx.signal,
    subscribe: (cb) => subscribeGroup(handle, cb),
    timeoutMs: action === "invite" ? INVITE_SETTLE_MS : SETTLE_MS,
  });
  const { confirmed, ...fields } = JUDGES[action](to, answer);
  const systemLine = answer?.kind === "system" ? answer.text : undefined;
  return {
    ...fields,
    after: { action, confirmed, systemLine, text: undefined, to },
    body: [],
  };
}

function social(
  args: SocialArgs,
  ctx: ToolCtx<SocialAfter>,
): Promise<ToolResult<SocialAfter>> {
  const text = args.text?.trim() || undefined;
  const to = args.to?.trim() || undefined;
  const request: Request = {
    action:
      SOCIAL_ACTIONS.find((known) => known === args.do) ??
      (to ? "whisper" : "say"),
    text,
    to,
  };
  checkRequest(request, ctx.rt);
  const { action } = request;
  return isChat(action)
    ? chat({ action, text: text ?? "", to }, ctx)
    : group({ action, to }, ctx);
}

export const socialTool = defineGameTool({
  fallback: emptySocial,
  kind: "action",
  minimalArgs: { text: "hello" },
  name: "social",
  parameters: socialParams,
  renderers: socialRenderers,
  run: social,
  text: {
    description:
      "Sends one chat message or does one group action: say, whisper, party, guild, invite, accept or decline an invite, or leave the group. It waits up to 2 seconds for the server to confirm it.",
    guidelines: [
      'To answer a whisper, set do to "whisper" and to to the exact name from the [game] line.',
      "Never put an account name or a password in text.",
    ],
    label: "Social",
  },
});
