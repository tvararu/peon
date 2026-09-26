import { ignoreFailure } from "#lib/ignore-failure";
import type { ClientConfig } from "#wow/client";
import type { Capabilities } from "#wow/client-extras";
import type { CombatRuntime } from "#wow/combat";
import {
  type FactionTemplateCatalog,
  loadFactionTemplates,
} from "#wow/faction-template";
import { createNavigation, type Navigation } from "#wow/navigation";
import { loadSpellCatalog } from "#wow/spell-catalog";

export type LazyState = {
  disposed: boolean;
  catalogPromise?: Promise<void>;
  spellsLoaded?: boolean;
  factions?: FactionTemplateCatalog;
  factionPromise?: Promise<void>;
  navigation?: Navigation;
};

type SpellData = Pick<ClientConfig, "spellDataDir">;
type NavigationData = Pick<
  ClientConfig,
  "navigationDataDir" | "navigationLibrary"
>;
type Configured = NavigationData & Pick<ClientConfig, "jevApiKey">;
type CatalogSink = Pick<CombatRuntime, "setCatalog">;

export function loadCatalog(
  config: SpellData,
  lazy: LazyState,
  combat: CatalogSink,
): Promise<void> {
  if (!config.spellDataDir)
    return Promise.reject(new Error("missing_spell_data"));
  lazy.catalogPromise ??= loadSpellCatalog(config.spellDataDir).then(
    (catalog) => {
      if (lazy.disposed) return;
      combat.setCatalog(catalog);
      lazy.spellsLoaded = true;
    },
  );
  return lazy.catalogPromise;
}

export function loadFactions(
  config: SpellData,
  lazy: LazyState,
): Promise<void> {
  if (!config.spellDataDir)
    return Promise.reject(new Error("missing_spell_data"));
  lazy.factionPromise ??= loadFactionTemplates(config.spellDataDir).then(
    (data) => {
      if (!lazy.disposed) lazy.factions = data;
    },
  );
  return lazy.factionPromise;
}

export function loadNavigation(
  config: NavigationData,
  lazy: LazyState,
): Navigation {
  if (!(config.navigationDataDir && config.navigationLibrary))
    throw new Error("missing_navigation");
  lazy.navigation ??= createNavigation({
    dataPath: config.navigationDataDir,
    libraryPath: config.navigationLibrary,
  });
  return lazy.navigation;
}

export function warmCatalogs(
  config: SpellData,
  lazy: LazyState,
  combat: CatalogSink,
): void {
  if (!config.spellDataDir) return;
  loadCatalog(config, lazy, combat).catch(ignoreFailure);
  loadFactions(config, lazy).catch(ignoreFailure);
}

export function capabilitiesOf(
  config: Configured,
  lazy: LazyState,
): Capabilities {
  return {
    factions: lazy.factions !== undefined,
    spells: lazy.spellsLoaded === true,
    navigation: Boolean(config.navigationDataDir && config.navigationLibrary),
    jev: Boolean(config.jevApiKey),
  };
}
