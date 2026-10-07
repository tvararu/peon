import { GameOpcode } from "#wow/protocol/opcodes";
import type { OpcodeDispatch } from "#wow/protocol/world";

export const STUBS: [opcode: number, label: string][] = [];

export type StubNotice = { opcode: number; label: string; text: string };

const NAMES = new Map<number, string>(
  Object.entries(GameOpcode).map(([name, opcode]) => [opcode, name]),
);

function stubNotice(opcode: number, label: string): StubNotice {
  return { opcode, label, text: `[peon] ${label} is not yet implemented` };
}

export function unhandledNotice(opcode: number): StubNotice {
  const hex = `0x${opcode.toString(16).padStart(3, "0")}`;
  return stubNotice(opcode, NAMES.get(opcode) ?? `Opcode ${hex}`);
}

export function registerStubs(
  dispatch: OpcodeDispatch,
  notify: (notice: StubNotice) => boolean,
  stubs: readonly (readonly [opcode: number, label: string])[] = STUBS,
): void {
  for (const [opcode, label] of stubs) {
    if (dispatch.has(opcode)) continue;
    const notice = stubNotice(opcode, label);
    let fired = false;
    dispatch.on(opcode, () => {
      if (!fired) fired = notify(notice);
    });
  }
}
