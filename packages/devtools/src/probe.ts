import { PROBE_USAGE, parseProbeArgs } from "#tools/probe-args";
import { runProbe } from "#tools/probe-run";

const parsed = parseProbeArgs(Bun.argv.slice(2));
if ("usage" in parsed) {
  console.error(`protocol:probe: ${parsed.usage}\n\n${PROBE_USAGE}`);
  process.exit(2);
}
const { code, report } = await runProbe(parsed, { root: process.cwd() });
console.log(JSON.stringify(report, null, 2));
process.exit(code);
