import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const RAID_MAP = 631;
const RAID_DIFFICULTY = 1;
const SETTLE_MS = 3000;

async function run({ handle, args }: FlowContext): Promise<Json> {
  const lockouts = await handle.instances.act.requestLockouts();
  const report: Record<string, Json> = {
    lockouts:
      lockouts.status === "ok"
        ? {
            locks: lockouts.locks.map((lock) => ({
              difficulty: lock.difficulty,
              extended: lock.extended,
              instanceGuid: `0x${lock.instanceGuid.toString(16)}`,
              locked: lock.locked,
              mapId: lock.mapId,
              secondsToReset: lock.secondsToReset,
            })),
            status: lockouts.status,
          }
        : lockouts,
  };
  if (args["lock"] === "1")
    report["lock"] = await handle.instances.act.answerBind(true);
  if (args["extend"] === "1")
    report["extend"] = await handle.instances.act.setLockoutExtended({
      difficulty: RAID_DIFFICULTY,
      extended: true,
      mapId: RAID_MAP,
    });
  if (args["lock"] === "1" || args["extend"] === "1")
    await Bun.sleep(SETTLE_MS);
  return report;
}

export const flow: ProbeFlow = {
  name: "instances-raid-info",
  run,
  usage:
    "--flow instances-raid-info: ask for the saved instances with CMSG_REQUEST_RAID_INFO and print the locks from SMSG_RAID_INSTANCE_INFO; --arg lock=1 also answers a bind offer and --arg extend=1 asks to extend map 631 (heroic), each refusing before it sends without a pending bind or a matching lock, then the flow waits 3 s.",
};
