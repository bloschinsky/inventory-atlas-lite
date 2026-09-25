import { AppError } from '../../shared/appError.js';

/*
  Errors that carry a `status` and a stable `code` are answered with them and their parameters; the
  browser translates the code. Everything else reaches the central error handler as an unexpected
  failure and is reported without any internal detail.
*/
export const httpError = (status, code, params = {}) => new AppError(code, params, status);
