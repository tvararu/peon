export const JEV_UNAVAILABLE = "jev_unavailable";

export class JevUnavailableError extends Error {
  readonly detail: string;

  constructor(detail: string, options?: ErrorOptions) {
    super(`${JEV_UNAVAILABLE}: ${detail}`, options);
    this.name = "JevUnavailableError";
    this.detail = detail;
  }
}

export class JevTransportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JevTransportError";
  }
}
