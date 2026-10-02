import type { ItemsEvent } from "#wow/areas/items/events";
import type {
  RefundInfoPacket,
  RefundResultPacket,
} from "#wow/areas/items/protocol-refund";
import type {
  RefundInfoRequest,
  RefundRequest,
  RefundSlice,
} from "#wow/areas/items/refunds";

export type RefundsHost = {
  refunds: RefundSlice;
  events: { emit: (event: ItemsEvent) => void };
  now: () => number;
  entryOf: (itemGuid: bigint) => number | undefined;
};

export type RefundsBehavior = {
  receiveRefundInfo: (packet: RefundInfoPacket) => void;
  expireRefundInfo: () => void;
  abandonRefundInfo: () => void;
  receiveRefundResult: (packet: RefundResultPacket) => void;
  expireRefund: () => void;
  abandonRefund: () => void;
};

const infoHead = (request: RefundInfoRequest, host: RefundsHost) => ({
  itemGuid: request.itemGuid,
  entry: host.entryOf(request.itemGuid),
});

const refundHead = (request: RefundRequest, host: RefundsHost) => ({
  itemGuid: request.itemGuid,
  entry: host.entryOf(request.itemGuid),
});

export const refundsBehavior = (host: RefundsHost): RefundsBehavior => ({
  receiveRefundInfo: (packet) => {
    const settled = host.refunds.receiveInfo(packet, host.now());
    if (!settled) return;
    host.events.emit({
      type: "refund_info",
      offer: settled.info,
      ...infoHead(settled.request, host),
    });
  },

  expireRefundInfo: () => {
    const outcome = host.refunds.expireInfo(host.now());
    if (!outcome) return;
    host.events.emit({
      type: "refund_info_none",
      ...infoHead(outcome.request, host),
    });
  },
  abandonRefundInfo: () => {
    host.refunds.abandonInfo();
  },

  receiveRefundResult: (packet) => {
    const outcome = host.refunds.confirm(packet, host.now());
    if (!outcome) return;
    host.events.emit({
      type: "refund_result",
      result: packet,
      ...refundHead(outcome.request, host),
    });
  },

  expireRefund: () => {
    const outcome = host.refunds.expireRefund(host.now());
    if (!outcome) return;
    host.events.emit({
      type: "refund_unanswered",
      ...refundHead(outcome.request, host),
    });
  },

  abandonRefund: () => {
    host.refunds.abandonRefund();
  },
});
