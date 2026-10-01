import { describe, expect, test } from "bun:test";
import type { ClientConfig, WorldHandle } from "@peon/core";
import { ServiceError } from "#factory/realm-service";
import type { CharEndpoint, Json } from "#factory/soap-create";
import {
  type CreateDeps,
  createByProtocol,
  learnOnline,
  specOf,
  stagePreset,
} from "#factory/soap-create";
import {
  isCreatePreset,
  type Preset,
  presetSpecs,
  type StageStep,
} from "#factory/soap-presets";

const item6256: StageStep = {
  body: { count: 1, item: 6256 },
  endpoint: "items/add",
};
function serviceDouble() {
  const calls: { character: string; endpoint: CharEndpoint; body: Json }[] = [];
  return {
    calls,
    service: {
      char: async (character: string, endpoint: CharEndpoint, body: Json) => {
        calls.push({ body, character, endpoint });
        return {};
      },
    },
  };
}

function loginDouble(seen: { skill: boolean }) {
  const logouts: string[] = [];
  const handle = {
    closed: Promise.resolve(),
    getControlState: () => ({ selfGuid: 1n }),
    getEntity: () => ({
      rawFields: new Map(seen.skill ? [[636, 356 + 65_536]] : []),
    }),
    logout: () => {
      logouts.push("logout");
    },
  } as unknown as WorldHandle;
  return {
    handle,
    login: async () => handle,
    logouts,
  };
}

type ServiceCall = { body: Json; character: string; endpoint: CharEndpoint };

type ServiceDouble = { calls: ServiceCall[]; service: CreateDeps["service"] };

const pinfoText = (account: string, gmLevel: number) =>
  [
    "| Player Faaaaaaaaab (guid: 2515)",
    `| Account: ${account} (ID: 309),`,
    `   GMLevel: ${gmLevel}`,
  ].join("\n");

function depsFor(
  _preset: Preset,
  overrides?: Partial<CreateDeps>,
): { commands: string[]; deps: CreateDeps; service: ServiceDouble } {
  const commands: string[] = [];
  const service = serviceDouble();
  const login = loginDouble({ skill: true });
  const deps: CreateDeps = {
    auth: async () => ({
      realmHost: "h",
      realmId: 1,
      realmPort: 1,
      sessionKey: new Uint8Array(0),
    }),
    console: async () => ({ ok: true, text: "" }),
    copy: async () => 1,
    create: async () => ({ result: "success" }),
    createConfig: (names) =>
      ({ account: names.account, character: names.character }) as ClientConfig,
    login: login.login,
    loginConfig: async (account) =>
      ({ account, character: "Faaaaaaaaab" }) as ClientConfig,
    names: { account: "FAC0000000001", character: "Faaaaaaaaab" },
    run: async (command) => {
      commands.push(command);
      return {
        ok: true,
        text: command.startsWith("pinfo") ? pinfoText("FAC0000000001", 0) : "",
      };
    },
    service: service.service,
    sleep: async () => undefined,
    templateEnv: {},
    ...overrides,
  };
  return { commands, deps, service };
}

function privilegeDouble(preset: Preset, stuck = false) {
  const level = { value: 0 };
  const made = depsFor(preset);
  made.deps.run = async (command) => {
    const set = /^account set gmlevel \S+ (\d+) -1$/.exec(command);
    if (set) {
      if (!(stuck && set[1] === "0")) level.value = Number(set[1]);
      return { ok: true, text: "" };
    }
    return {
      ok: true,
      text: command.startsWith("pinfo")
        ? pinfoText("FAC0000000001", level.value)
        : "",
    };
  };
  return { ...made, level };
}

describe("specOf", () => {
  test("resolves created presets and refuses template ones", () => {
    expect(specOf("eversong10-shaman").create).toMatchObject({
      class: 7,
      race: 2,
    });
    expect(() => specOf("eversong10")).toThrow("not created");
  });
});

describe("createByProtocol", () => {
  test("creates the shaman and stages state in table order", async () => {
    const { commands, deps, service } = depsFor("eversong10-shaman");
    let seen: {
      config?: ClientConfig;
      name?: string;
      race?: number;
      class?: number;
    } = {};
    deps.create = (async (config, _auth, spec) => {
      seen = { class: spec.class, config, name: spec.name, race: spec.race };
      return { result: "success" };
    }) as CreateDeps["create"];
    deps.run = (async (command: string) => {
      commands.push(command);
      return { ok: true, text: "FAC0000000001" };
    }) as CreateDeps["run"];
    await createByProtocol("eversong10-shaman", deps);
    expect(seen).toMatchObject({
      class: 7,
      name: "Faaaaaaaaab",
      race: 2,
    });
    expect(service.calls.map((c) => c.endpoint)).toEqual([
      "position",
      "level",
      "money",
      "items/add",
      "items/add",
      "spells/learn",
      "spells/learn",
      "spells/learn",
      "spells/learn",
      "spells/learn",
    ]);
    expect(service.calls[0]?.body).toMatchObject({ map: 530, x: 8735 });
    expect(commands.some((c) => c.includes("pdump"))).toBe(false);
    expect(commands.some((c) => c.includes("gmlevel"))).toBe(false);
  });

  test("no created preset touches templates", async () => {
    for (const preset of Object.keys(presetSpecs) as Preset[]) {
      if (!isCreatePreset(presetSpecs[preset])) continue;
      const { commands, deps, service } = depsFor(preset);
      deps.run = (async (command: string) => {
        commands.push(command);
        return {
          ok: true,
          text: command.startsWith("pinfo")
            ? pinfoText("FAC0000000001", 0)
            : "",
        };
      }) as CreateDeps["run"];
      await createByProtocol(preset, deps);
      const text = [...commands, ...service.calls.map((c) => c.endpoint)].join(
        " ",
      );
      expect(text).not.toContain("TCPRESETS");
      expect(text).not.toContain("pdump");
      expect(text).not.toContain("Tpl");
    }
  });

  test("the death knight is created at security 1 and staged at 0", async () => {
    const { deps, level, service } = privilegeDouble("eversong55-deathknight");
    let levelAtCreate = -1;
    let levelAtStage = -1;
    deps.create = (async () => {
      levelAtCreate = level.value;
      return { result: "success" };
    }) as CreateDeps["create"];
    const inner = deps.service.char;
    deps.service.char = async (c, e, b) => {
      levelAtStage = level.value;
      return inner(c, e, b);
    };
    await createByProtocol("eversong55-deathknight", deps);
    expect(levelAtCreate).toBe(1);
    expect(levelAtStage).toBe(0);
    expect(level.value).toBe(0);
    expect(service.calls.length).toBeGreaterThan(0);
  });

  test("the death knight demotes even when creation throws", async () => {
    const { deps, level } = privilegeDouble("eversong55-deathknight");
    deps.create = (async () => {
      throw new Error("Character create: level_requirement");
    }) as CreateDeps["create"];
    await expect(
      createByProtocol("eversong55-deathknight", deps),
    ).rejects.toThrow("level_requirement");
    expect(level.value).toBe(0);
  });

  test("the death knight demotes when the raise applies then rejects", async () => {
    const { deps, level } = privilegeDouble("eversong55-deathknight");
    const inner = deps.run;
    let created = false;
    deps.create = (async () => {
      created = true;
      return { result: "success" };
    }) as CreateDeps["create"];
    deps.run = async (command) => {
      const res = await inner(command);
      if (command.includes(" 1 -1")) throw new Error("soap read timed out");
      return res;
    };
    await expect(
      createByProtocol("eversong55-deathknight", deps),
    ).rejects.toThrow("soap read timed out");
    expect(created).toBe(false);
    expect(level.value).toBe(0);
  });

  test("a failed demotion still fails when creation also threw", async () => {
    const { deps } = privilegeDouble("eversong55-deathknight", true);
    deps.create = (async () => {
      throw new Error("Character create: level_requirement");
    }) as CreateDeps["create"];
    await expect(
      createByProtocol("eversong55-deathknight", deps),
    ).rejects.toThrow();
  });

  test("a stuck GMLevel 1 fails creation", async () => {
    const { commands, deps } = depsFor("eversong55-deathknight", {
      run: (async (command: string) => {
        commands.push(command);
        if (command.startsWith("pinfo"))
          return { ok: true, text: pinfoText("FAC0000000001", 1) };
        return { ok: true, text: "" };
      }) as CreateDeps["run"],
    });
    await expect(
      createByProtocol("eversong55-deathknight", deps),
    ).rejects.toThrow("demotion");
  });

  test("a fresh account is reachable after one auth 0x4", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const { deps } = depsFor("eversong10-rogue", {
      sleep: (async (ms: number) => {
        sleeps.push(ms);
      }) as CreateDeps["sleep"],
    });
    const inner = deps.auth;
    deps.auth = (async (config: ClientConfig) => {
      calls += 1;
      if (calls === 1) throw new Error("Auth challenge failed: status 0x4");
      return inner(config);
    }) as CreateDeps["auth"];
    await createByProtocol("eversong10-rogue", deps);
    expect(calls).toBe(2);
    expect(sleeps.length).toBeGreaterThan(0);
  });

  test("a persistent auth 0x4 fails creation", async () => {
    const { deps } = depsFor("eversong10-rogue", {
      auth: (async () => {
        throw new Error("Auth challenge failed: status 0x4");
      }) as CreateDeps["auth"],
    });
    await expect(createByProtocol("eversong10-rogue", deps)).rejects.toThrow(
      "status 0x4",
    );
  });

  test("a non-success result fails with the reason name", async () => {
    const { deps } = depsFor("eversong10-rogue", {
      create: (async () => {
        throw new Error("Character create: name_in_use");
      }) as CreateDeps["create"],
    });
    await expect(createByProtocol("eversong10-rogue", deps)).rejects.toThrow(
      "name_in_use",
    );
  });

  test("the fishing template preset copies then stages", async () => {
    const { deps, service } = depsFor("eversong10-fishing");
    let copied = "";
    deps.copy = (async (template: string) => {
      copied = template;
      return 1;
    }) as CreateDeps["copy"];
    await createByProtocol("eversong10-fishing", deps);
    expect(copied).toBe("Tpleversong");
    expect(service.calls.map((c) => c.endpoint)).toEqual(["items/add"]);
  });

  test("the fishing preset honors a soap.env template override", async () => {
    const { deps } = depsFor("eversong10-fishing", {
      templateEnv: { PEON_PRESET_EVERSONG10_FISHING: "Tplalt" },
    });
    let copied = "";
    deps.copy = (async (template: string) => {
      copied = template;
      return 1;
    }) as CreateDeps["copy"];
    await createByProtocol("eversong10-fishing", deps);
    expect(copied).toBe("Tplalt");
  });

  test("a fishing online failure fails creation", async () => {
    const { deps } = depsFor("eversong10-fishing", {
      login: (async () => {
        throw new Error("World connection closed");
      }) as CreateDeps["login"],
    });
    await expect(createByProtocol("eversong10-fishing", deps)).rejects.toThrow(
      "World connection closed",
    );
  });
});

describe("stagePreset", () => {
  test("the fishing stage learns online before staging the pole", async () => {
    const { deps, service } = depsFor("eversong10-fishing");
    const learned: number[][] = [];
    const fishing = presetSpecs["eversong10-fishing"];
    if (!("stage" in fishing && fishing.stage)) throw new Error("unreachable");
    const learnedAtItems: number[] = [];
    const inner = service.service.char;
    const counting = {
      ...service.service,
      char: (async (c: string, e: CharEndpoint, b: Json) => {
        learnedAtItems.push(learned.length);
        return inner(c, e, b);
      }) as CreateDeps["service"]["char"],
    };
    await stagePreset("Faaaaaaaaab", "FAC0000000001", fishing.stage, {
      ...deps,
      login: (async () => {
        learned.push([7733]);
        return loginDouble({ skill: true }).handle;
      }) as CreateDeps["login"],
      service: counting,
    });
    expect(service.calls.map((c) => c.endpoint)).toEqual(["items/add"]);
    expect(service.calls[0]).toMatchObject({
      body: { count: 1, item: 6256 },
      endpoint: "items/add",
    });
    expect(learnedAtItems).toEqual([1]);
  });

  test("a pole step retries while the character is still leaving the world", async () => {
    const { deps, service } = depsFor("eversong10-fishing");
    let refusals = 2;
    const slept: number[] = [];
    await stagePreset("Faaaaaaaaab", "FAC0000000001", [item6256], {
      ...deps,
      service: {
        char: (async (c: string, e: CharEndpoint, b: Json) => {
          if (refusals-- > 0)
            throw new ServiceError("character_online", 409, "online");
          return service.service.char(c, e, b);
        }) as CreateDeps["service"]["char"],
      },
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(service.calls).toHaveLength(1);
    expect(slept).toHaveLength(2);
  });

  test("other service refusals are not retried", async () => {
    const { deps } = depsFor("eversong10-fishing");
    let calls = 0;
    const err = stagePreset("Faaaaaaaaab", "FAC0000000001", [item6256], {
      ...deps,
      service: {
        char: (async () => {
          calls++;
          throw new ServiceError("bad_request", 400, "no");
        }) as CreateDeps["service"]["char"],
      },
    });
    await expect(err).rejects.toThrow("bad_request");
    expect(calls).toBe(1);
  });

  test("a character that never leaves the world fails the step", async () => {
    const { deps } = depsFor("eversong10-fishing");
    const err = stagePreset("Faaaaaaaaab", "FAC0000000001", [item6256], {
      ...deps,
      service: {
        char: (async () => {
          throw new ServiceError("character_online", 409, "online");
        }) as CreateDeps["service"]["char"],
      },
    });
    await expect(err).rejects.toThrow("character_online");
  });
});

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
