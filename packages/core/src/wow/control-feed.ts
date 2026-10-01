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
      control.handleTransferPending(event.transport);
      return;
    case "transfer_aborted":
      control.transferAborted(event);
      return;
    case "new_world":
      control.newWorld(event.position);
      return;
    default:
      feedMovement(control, event);
  }
}

type MovementEvent = Extract<
  SelfEvent,
  {
    type:
      | "force_root"
      | "force_unroot"
      | "knock_back"
      | "client_control"
      | "force_speed"
      | "can_fly"
      | "move_flag"
      | "collision_height"
      | "observed"
      | "spline"
      | "vehicle_seat"
      | "vehicle_left"
      | "mover_state"
      | "mover_packet"
      | "transport_board"
      | "transport_leave";
  }
>;

function feedMovement(control: ControlRuntime, event: MovementEvent): void {
  switch (event.type) {
    case "force_root":
      control.forceRoot(event.counter, event.guid);
      return;
    case "force_unroot":
      control.forceUnroot(event.counter, event.guid);
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
      control.moveFlag(event.flag, event.enable, event.counter, event.guid);
      return;
    case "collision_height":
      control.collisionHeight(event.counter, event.height);
      return;
    case "observed":
      control.observeSelf(event.observation);
      return;
    case "spline":
      control.observeSelfSpline(event.move);
      return;
    case "vehicle_seat":
      control.vehicleSeat(event);
      return;
    case "vehicle_left":
      control.vehicleLeft();
      return;
    case "mover_state":
      control.moverState(event);
      return;
    case "mover_packet":
      control.moverPacket(event.opcode, event.build);
      return;
    case "transport_board":
      control.transportBoard(event);
      return;
    case "transport_leave":
      control.transportLeave();
      return;
    default: {
      const unhandled: never = event;
      throw new Error("unhandled self event", { cause: unhandled });
    }
  }
}
