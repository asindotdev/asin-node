import type { RawResponse } from "./types.js";

export class AsinError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The client configuration is missing or unusable. */
export class AsinConfigurationError extends AsinError {}

/** A request value cannot be represented safely on the wire. */
export class AsinSerializationError extends AsinError {
  readonly param: string | undefined;

  constructor(message: string, param?: string, options?: ErrorOptions) {
    super(message, options);
    this.param = param;
  }
}

/** The request failed before a complete HTTP response was received. */
export class AsinTransportError extends AsinError {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

/** Asin returned a non-success HTTP status. */
export class AsinApiError extends AsinError {
  readonly status: number;
  readonly errorMessage: string | undefined;
  readonly responseBody: unknown;
  readonly rawResponse: RawResponse;

  constructor(args: {
    rawResponse: RawResponse;
    responseBody?: unknown;
    errorMessage?: string;
  }) {
    super(
      args.errorMessage ??
        `Asin API request failed with status ${args.rawResponse.status}.`,
    );
    this.status = args.rawResponse.status;
    this.errorMessage = args.errorMessage;
    this.responseBody = args.responseBody;
    this.rawResponse = args.rawResponse;
  }
}

/** A successful response could not be decoded as the documented representation. */
export class AsinResponseDecodingError extends AsinError {
  readonly rawResponse: RawResponse;

  constructor(message: string, rawResponse: RawResponse, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.rawResponse = rawResponse;
  }
}
