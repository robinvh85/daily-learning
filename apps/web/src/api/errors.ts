/** Error of an `/api/*` call, with the HTTP-like status the pages check (401, 404…). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
