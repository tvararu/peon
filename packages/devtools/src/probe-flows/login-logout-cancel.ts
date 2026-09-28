import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const BEFORE_CANCEL_MS = 2000;
const HOLD_MS = 25_000;

async function run({ handle }: FlowContext): Promise<Json> {
  await Bun.sleep(BEFORE_CANCEL_MS);
  const error = await handle.login.act.cancelLogout().then(
    () => undefined,
    (failure: unknown) => String(failure),
  );
  if (error !== undefined) return { cancelled: false, error };
  await Bun.sleep(HOLD_MS);
  return { cancelled: true };
}

export const flow: ProbeFlow = {
  name: "login-logout-cancel",
  run,
  usage:
    "--flow login-logout-cancel: after --send CMSG_LOGOUT_REQUEST, wait 2 s, cancel the logout, then hold the session 25 s.",
};
