import type { WorldHandle } from "#wow/client";
import {
  type ActionButton,
  parseActionButtons,
} from "#wow/protocol/action-buttons";
import type { PacketReader } from "#wow/protocol/packet";
import type { SessionStores } from "#wow/session-stores";

type ActionBarMethods = Pick<WorldHandle, "getActionBar">;

export class ActionBarStore {
  private buttons: readonly ActionButton[] = [];

  snapshot(): ActionButton[] {
    return this.buttons.map((button) => ({ ...button }));
  }

  receive(r: PacketReader): void {
    const parsed = parseActionButtons(r);
    this.buttons = parsed.behavior === "clear" ? [] : parsed.buttons;
  }

  dispose(): void {
    this.buttons = [];
  }
}

export function actionBarMethods(
  stores: Pick<SessionStores, "actionBar">,
): ActionBarMethods {
  return {
    getActionBar() {
      return stores.actionBar.snapshot();
    },
  };
}
