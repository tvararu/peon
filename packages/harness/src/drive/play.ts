import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  type Done,
  interact,
  type PlayWorld,
  targetNext,
  useSlot,
} from "#harness/drive/actions";
import { type DriveTimers, HeldKeys } from "#harness/drive/held";
import {
  ENTER_KEYS,
  type KeyEvent,
  type PlayCommand,
  playCommand,
  readKey,
} from "#harness/drive/keys";
import { handBackNote, type Journal, startJournal } from "#harness/drive/note";
import type { Claim, WorldService } from "#harness/world/service";

export type PlayMode = "talk" | "play";
export type Consumed = { consume: true } | undefined;

export type PlayHost = {
  world: () => WorldService | undefined;
  ui: () => Pick<ExtensionUIContext, "setWidget"> | undefined;
  busy: () => boolean;
  abort: () => void;
  handBack: (note: string) => void;
  timers: DriveTimers;
};

export const WIDGET = "peon-drive";
const CONSUME = { consume: true } as const;
const KEY_LABEL: Record<string, string> = {
  a: "A",
  d: "D",
  e: "E",
  q: "Q",
  s: "S",
  w: "W",
};

export class Play {
  private mode: PlayMode = "talk";
  private claim: Claim | undefined;
  private journal: Journal | undefined;
  private target: bigint | undefined;
  private targetName: string | undefined;
  private flash = "";
  private readonly held: HeldKeys;

  private readonly host: PlayHost;

  constructor(host: PlayHost) {
    this.host = host;
    this.held = new HeldKeys({
      changed: () => this.render(),
      send: (input, leaseMs) =>
        this.claim?.act.drive(input, leaseMs).catch((error: Error) => {
          this.flash = `Move refused: ${error.message}.`;
          this.render();
        }),
      timers: host.timers,
    });
  }

  current(): PlayMode {
    return this.mode;
  }

  holding(): boolean {
    return this.claim?.held() ?? false;
  }

  input(data: string): Consumed {
    const key = readKey(data);
    if (!key) return undefined;
    if (ENTER_KEYS.includes(key.id)) {
      if (key.phase === "press") this.enter();
      return CONSUME;
    }
    if (this.mode !== "play") return undefined;
    return this.command(playCommand(key.id), key);
  }

  enter(): void {
    if (this.mode === "play") return;
    const world = this.host.world();
    if (!world) return;
    if (!this.claim?.held()) this.takeOver(world);
    if (!this.claim) return;
    this.mode = "play";
    this.flash = "";
    this.render();
  }

  dispose(): void {
    this.held.clear();
    this.journal?.dispose();
    this.claim?.release();
    this.claim = undefined;
    this.host.ui()?.setWidget(WIDGET, undefined);
  }

  private takeOver(world: WorldService): void {
    this.journal?.dispose();
    this.journal = startJournal(world, this.host.timers.now);
    this.claim = world.claim("human", "play");
    if (!this.claim) {
      this.journal.dispose();
      this.journal = undefined;
      return;
    }
    this.claim.onLost(() => this.lost());
    if (this.host.busy()) this.host.abort();
  }

  private lost(): void {
    this.held.clear();
    this.journal?.dispose();
    this.journal = undefined;
    this.claim = undefined;
    this.mode = "talk";
    this.render();
  }

  private command(command: PlayCommand, key: KeyEvent): Consumed {
    if (command.type === "hold") {
      this.held.key(command.key, key.phase);
      return CONSUME;
    }
    if (command.type === "pass") return undefined;
    if (command.type === "stop") {
      this.held.clear();
      return undefined;
    }
    if (key.phase === "press") this.press(command);
    return CONSUME;
  }

  private press(command: PlayCommand): void {
    if (command.type === "talk") {
      this.toTalk();
      return;
    }
    if (command.type === "hand_back") {
      this.handBack().catch(ignoreFailure);
      return;
    }
    const act = this.act(command);
    if (!act) return;
    act
      .then((done) => this.done(done))
      .catch((error: Error) =>
        this.done({ text: `Refused: ${error.message}.` }),
      );
  }

  private act(command: PlayCommand): Promise<Done> | undefined {
    const session = this.host.world()?.current();
    const claim = this.claim;
    if (!(session && claim)) return undefined;
    const world: PlayWorld = { act: claim.act, reads: session.reads };
    const target = session.reads.getCombatState().selectedGuid ?? this.target;
    if (command.type === "jump")
      return claim.act.jump().then(() => ({ action: "jumped", text: "" }));
    if (command.type === "next_target") return targetNext(world, target);
    if (command.type === "slot") return useSlot(world, command.slot, target);
    if (command.type === "interact") return interact(world, target);
    return undefined;
  }

  private done(done: Done): void {
    this.flash = done.text;
    if (done.target) {
      this.journal?.target(done.target);
      this.targetName = done.target;
    }
    if (done.action) this.journal?.action(done.action);
    const selected = this.host.world()?.current()?.reads.getCombatState();
    this.target = selected?.selectedGuid ?? this.target;
    this.render();
  }

  private toTalk(): void {
    this.held.clear();
    this.mode = "talk";
    this.render();
  }

  private async handBack(): Promise<void> {
    const { claim, journal } = this;
    this.held.clear();
    this.mode = "talk";
    this.claim = undefined;
    this.journal = undefined;
    if (!claim) return this.render();
    await claim.act.drive({}, 1).catch(ignoreFailure);
    const back = journal?.finish(this.host.world()?.current()?.reads);
    journal?.dispose();
    claim.release();
    this.render();
    if (back) this.host.handBack(handBackNote(back));
  }

  private render(): void {
    const ui = this.host.ui();
    if (!ui) return;
    if (this.mode === "talk" && !this.claim) {
      ui.setWidget(WIDGET, undefined);
      return;
    }
    ui.setWidget(WIDGET, [this.line()], { placement: "aboveEditor" });
  }

  private targetText(): string {
    const combat = this.host.world()?.current()?.reads.getCombatState();
    if (combat?.selectedGuid === undefined) return "no target";
    const name =
      combat.target?.guid === combat.selectedGuid
        ? combat.target.name
        : this.targetName;
    return `target ${name ?? "unnamed"}`;
  }

  private line(): string {
    if (this.mode === "talk")
      return "TALK · you hold the character; the agent waits · F1 drive · Esc in PLAY hands back";
    const keys = this.held.keys().map((key) => KEY_LABEL[key] ?? key);
    const heldText =
      keys.length === 0
        ? "no keys"
        : `keys ${keys.join("+")}${this.held.estimated() ? " (estimated)" : ""}`;
    const parts = [
      "PLAY",
      heldText,
      this.targetText(),
      "Esc hand back · Enter talk",
      ...(this.flash ? [this.flash] : []),
    ];
    return parts.join(" · ");
  }
}
