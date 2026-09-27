import { homedir } from "node:os";
import {
  harnessStateDir,
  parseFlags,
  USAGE,
  UsageError,
} from "#harness/config/flags";
import type { HarnessFlags } from "#harness/contract/config";

const flags = readFlags(Bun.argv.slice(2));
setDefault("PI_CODING_AGENT_DIR", `${harnessStateDir(homedir())}/agent`);
setDefault("PI_OFFLINE", "1");
setDefault("PI_SKIP_VERSION_CHECK", "1");
setDefault("PI_TELEMETRY", "0");
const { registerBunOAuthFlows } = await import(
  "@earendil-works/pi-ai/bun-oauth"
);
registerBunOAuthFlows();
const { main } = await import("#harness/main");
process.exit(await main(flags));

function readFlags(argv: readonly string[]): HarnessFlags {
  try {
    return parseFlags(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return process.exit(2);
  }
}

function setDefault(name: string, value: string): void {
  Bun.env[name] ??= value;
}
