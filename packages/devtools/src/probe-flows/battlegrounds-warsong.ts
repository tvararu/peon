import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const DEFAULT_BG = "2";
const POLL_MS = 5000;
const WAIT_S = 840;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function bgOf(args: Readonly<Record<string, string>>): number {
  const bg = Number(args["bg"] ?? DEFAULT_BG);
  if (!Number.isInteger(bg) || bg < 0)
    throw new Error("battlegrounds-warsong needs bg=<BattlemasterList id>.");
  return bg;
}

function errorJson(error: unknown): Json {
  return json({
    error: error instanceof Error ? error.message : String(error),
  });
}

async function waitFor(
  ctx: FlowContext,
  label: string,
  read: () => Json | undefined,
): Promise<Json> {
  const started = Date.now();
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() - started > WAIT_S * 1000)
      return json({
        missed: label,
        queue: ctx.handle.battlegrounds.state().queue,
      });
    await Bun.sleep(POLL_MS);
  }
}

function missed(value: Json): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "missed" in value &&
    typeof value.missed === "string"
  );
}

function joinedSlot(value: Json): number {
  if (
    value !== null &&
    typeof value === "object" &&
    "joined" in value &&
    value.joined !== null &&
    typeof value.joined === "object" &&
    "slot" in value.joined &&
    typeof value.joined.slot === "number"
  )
    return value.joined.slot;
  return 0;
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle } = ctx;
  const bg = bgOf(ctx.args);
  const log: Json[] = [];

  const queued = await handle.battlegrounds.act
    .list(bg)
    .then((list) => json({ list }))
    .catch(errorJson);
  const joined = await handle.battlegrounds.act
    .join(bg)
    .then((row) => json({ joined: row }))
    .catch(errorJson);
  log.push(json({ bg, joined, queued }));

  const entered = await (async () => {
    const invited = await waitFor(ctx, "invite", () => {
      const entry = handle.battlegrounds
        .state()
        .queue.slots.findIndex((one) => one.kind === "invited");
      return entry < 0 ? undefined : json({ inviteSlot: entry });
    });
    log.push(invited);
    if (missed(invited)) return;
    return handle.battlegrounds.act
      .answer(joinedSlot(joined), true)
      .then((row) => json({ entered: row }))
      .catch(errorJson);
  })();
  if (entered === undefined) return json({ log, status: "no_pop" });
  log.push(entered);

  const started = await waitFor(ctx, "start", () => {
    const match = handle.battlegrounds.state().match.current;
    return match === undefined ? undefined : json({ match });
  });
  log.push(started);
  if (missed(started)) {
    const left = await handle.battlegrounds.act
      .leaveBattleground()
      .then((row) => json({ left: row }))
      .catch(errorJson);
    log.push(left);
    return json({ log, status: "no_start" });
  }

  const score = await handle.battlegrounds.act
    .requestScore()
    .then((row) => json({ score: row }))
    .catch(errorJson);
  const carriers = await handle.battlegrounds.act
    .requestCarriers()
    .then((row) => json({ carriers: row }))
    .catch(errorJson);
  log.push(json({ carriers, score }));

  const teammate = others(handle).at(0);
  const report = await handle.battlegrounds.act
    .reportAfk(teammate ? BigInt(teammate.entity.guid) : 0n)
    .then((row) => json({ report: row }))
    .catch(errorJson);
  const spirit = others(handle)
    .filter((near) => near.roles.includes("spirit_guide"))
    .at(0);
  log.push(
    json({
      report,
      spirit: spirit ? summary(spirit) : null,
      teammate: teammate ? summary(teammate) : null,
    }),
  );

  const rez = spirit
    ? await handle.battlegrounds.act
        .queueSpiritGuide(BigInt(spirit.entity.guid))
        .then((row) => json({ rez: row }))
        .catch(errorJson)
    : json({ rez: "no_guide" });
  log.push(rez);

  const ended = await waitFor(ctx, "end", () => {
    const match = handle.battlegrounds.state().match.current;
    return match?.score?.ended === true
      ? json({ final: match.score })
      : undefined;
  });
  log.push(ended);

  const left = await handle.battlegrounds.act
    .leaveBattleground()
    .then((row) => json({ left: row }))
    .catch(errorJson);
  log.push(left);
  return json({ log, status: "match" });
}

export const flow: ProbeFlow = {
  name: "battlegrounds-warsong",
  run,
  usage:
    "--flow battlegrounds-warsong [--arg bg=<BattlemasterList id>, default 2]: join the Warsong Gulch queue, accept the invite, read the score and carriers, report one teammate, read the spirit guide timer, wait for the end, then leave. Returns status no_pop when no match forms.",
};
