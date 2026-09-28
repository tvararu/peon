import type { ControlRuntime } from "#wow/control";
import type { SelfEvent } from "#wow/self-store";

export function feedControl(control: ControlRuntime, event: SelfEvent): void {
  switch (event.type) {
    case "login_verified":
      control.loginVerified(event.position);
      return;
    case "near_teleport":
      control.nearTeleport(event.info);
      return;
    case "teleport_ack":
      control.teleportAck(event.ack);
      return;
    case "transfer_pending":
      control.handleTransferPending();
      return;
    case "new_world":
      control.newWorld(event.position);
      return;
    case "force_root":
      control.forceRoot(event.counter);
      return;
    case "force_unroot":
      control.forceUnroot(event.counter);
      return;
    case "knock_back":
      control.knockBack(event.knock);
      return;
    case "client_control":
      control.clientControl(event.control);
      return;
    case "force_speed":
      control.forceSpeed(event.spec, event.force);
      return;
    case "can_fly":
      control.setCanFly(event.counter, event.enable);
      return;
    case "move_flag":
      control.moveFlag(event.flag, event.enable, event.counter);
      return;
    case "observed":
      control.observeSelf(event.observation);
      return;
    default: {
      const unhandled: never = event;
      throw new Error("unhandled self event", { cause: unhandled });
    }
  }
}
