import { describe, expect, test } from "bun:test";
import { type CreateDeps, learnOnline } from "#factory/soap-create";
import { depsFor, loginDouble } from "#factory/soap-create-doubles";

describe("learnOnline", () => {
  test("learns the spell then logs out", async () => {
    const { deps } = depsFor("eversong10-fishing");
    const login = loginDouble({ skill: true });
    const learned: string[] = [];
    await learnOnline("FAC0000000001", [7733], {
      ...deps,
      console: (async (_a, command) => {
        learned.push(command);
        return { ok: true, text: "" };
      }) as CreateDeps["console"],
      login: login.login,
    });
    expect(learned).toEqual(["player learn Faaaaaaaaab 7733"]);
    expect(login.logouts).toEqual(["logout"]);
  });

  test("a refused console command fails the learn", async () => {
    const { deps } = depsFor("eversong10-fishing");
    await expect(
      learnOnline("FAC0000000001", [7733], {
        ...deps,
        console: (async () => ({
          ok: false,
          text: "nope",
        })) as CreateDeps["console"],
      }),
    ).rejects.toThrow("player learn 7733");
  });

  test("a missing skill fails the learn", async () => {
    const { deps } = depsFor("eversong10-fishing");
    const login = loginDouble({ skill: false });
    await expect(
      learnOnline("FAC0000000001", [7733], {
        ...deps,
        login: login.login,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("skill 356");
  });
});
