import type { AutocompleteProviderFactory } from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteItem,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

type Described = Record<string, { description?: string }>;

function tag(commands: Described, item: AutocompleteItem): AutocompleteItem {
  if (!Object.hasOwn(commands, item.value)) return item;
  const description = commands[item.value]?.description ?? "";
  return { ...item, description: `[wow] ${description}`.trimEnd() };
}

export function wowMenuTags(commands: Described): AutocompleteProviderFactory {
  return (current) => ({
    applyCompletion: current.applyCompletion.bind(current),
    async getSuggestions(
      lines,
      cursorLine,
      cursorCol,
      options,
    ): Promise<AutocompleteSuggestions | null> {
      const found = await current.getSuggestions(
        lines,
        cursorLine,
        cursorCol,
        options,
      );
      const typed = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const naming = typed.startsWith("/") && !typed.includes(" ");
      if (!(found && naming)) return found;
      return {
        ...found,
        items: found.items.map((item) => tag(commands, item)),
      };
    },
    shouldTriggerFileCompletion:
      current.shouldTriggerFileCompletion?.bind(current),
    triggerCharacters: current.triggerCharacters,
  });
}
