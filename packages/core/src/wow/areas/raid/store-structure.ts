import { partyOperationName, partyResultName } from "#wow/areas/raid/names";
import type { PartyCommandResult } from "#wow/protocol/group";

export type CommandResultEvent = {
  type: "command_result";
  operation: string;
  result: string;
  member: string;
};

export function commandResultEvent(
  parsed: PartyCommandResult,
): CommandResultEvent {
  return {
    member: parsed.member,
    operation: partyOperationName(parsed.operation),
    result: partyResultName(parsed.result),
    type: "command_result",
  };
}
