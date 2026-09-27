import type { SocialAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { socialParams } from "#harness/tools/params";

function emptySocial(): SocialAfter {
  return {
    action: "say",
    confirmed: false,
    systemLine: undefined,
    text: undefined,
    to: undefined,
  };
}

export const socialTool = defineGameTool({
  fallback: emptySocial,
  kind: "action",
  name: "social",
  parameters: socialParams,
  run: notBuilt,
});
