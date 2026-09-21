/*
  Errors that carry a `status` are answered with that status and their own message. Everything else
  reaches the central error handler as an unexpected failure.
*/
export const httpError = (message, status = 400) => Object.assign(new Error(message), { status });
