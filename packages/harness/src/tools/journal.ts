import type { JournalAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { journalParams } from "#harness/tools/params";

function emptyJournal(): JournalAfter {
  return { about: "log", label: "", more: 0, rows: [] };
}

export const journalTool = defineGameTool({
  fallback: emptyJournal,
  kind: "read",
  maxLines: 24,
  name: "journal",
  parameters: journalParams,
  run: notBuilt,
});
