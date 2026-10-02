export type ComplaintsState = { received: readonly number[] };

export type ComplaintsEvent = { type: "complaint_received"; code: number };
