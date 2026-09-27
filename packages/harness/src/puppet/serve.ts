import { messageOf } from "@peon/core/lib/errors";
import { bootPuppet } from "#harness/puppet/boot";
import type { PuppetLaunchMessage } from "#harness/puppet/launch";
import { puppetPaths } from "#harness/puppet/protocol";
import { defaultLogin } from "#harness/runtime/connection";

const notify = (message: PuppetLaunchMessage) => process.send?.(message);

try {
  const server = await bootPuppet({
    login: defaultLogin,
    paths: puppetPaths(),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      server.stop().finally(() => process.exit(0));
    });
  notify({ type: "ready" });
  await server.done;
  process.exit(0);
} catch (error) {
  notify({ message: messageOf(error), type: "failed" });
  process.exitCode = 1;
}
