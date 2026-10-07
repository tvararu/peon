export const TICKET_TEXT_MAX_BYTES = 0xff_ff;

export function cleanText(text: string): string {
  const cleaned = text.replaceAll("|", "");
  if (new TextEncoder().encode(cleaned).byteLength > TICKET_TEXT_MAX_BYTES)
    throw new RangeError(
      `Ticket text is over ${TICKET_TEXT_MAX_BYTES} bytes, not sendable.`,
    );
  return cleaned;
}
